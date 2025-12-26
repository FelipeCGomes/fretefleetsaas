import { db } from '../firebaseConfig.js';
import {
    doc, updateDoc, setDoc, deleteDoc, getDoc, arrayUnion, arrayRemove,
    collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class FreightModel {
    constructor(authService) {
        this.db = db;
        this.authService = authService;
        this.unsubscribeTeam = null;
        this.unsubscribeUser = null;

        // Cache local (1 hora)
        this.CACHE_TTL = 60 * 60 * 1000;

        // Padrões
        this.frotaDefault = [
            { id: "Van", tipo: "Van", capKg: 1800, qtd: 5, maxStops: 30, consumo: 9, eixos: 2, custoFixo: 100 },
            { id: "3/4", tipo: "3/4", capKg: 5000, qtd: 5, maxStops: 25, consumo: 7, eixos: 2, custoFixo: 150 },
            { id: "Toco", tipo: "Toco", capKg: 8000, qtd: 5, maxStops: 20, consumo: 5.5, eixos: 2, custoFixo: 200 },
            { id: "Truck", tipo: "Truck", capKg: 14000, qtd: 5, maxStops: 15, consumo: 4, eixos: 3, custoFixo: 300 },
            { id: "Bi-Truck", tipo: "Bi-Truck", capKg: 18000, qtd: 5, maxStops: 12, consumo: 3.5, eixos: 4, custoFixo: 350 },
            { id: "Carreta", tipo: "Carreta", capKg: 32000, qtd: 3, maxStops: 5, consumo: 2.5, eixos: 5, custoFixo: 450 },
            { id: "Rodotrem", tipo: "Rodotrem", capKg: 50000, qtd: 2, maxStops: 2, consumo: 1.8, eixos: 9, custoFixo: 700 }
        ];
        this.locaisSalvos = [];
        this.configGlobal = null;

        // Inteligência Compartilhada
        this.geoCache = {};
        this.memoriaPreferencias = {};
        this.teamMembers = [];
    }

    // --- SINCRONIZAÇÃO E CACHE ---
    async iniciarSincronizacao(userId, teamId) {
        if (userId) {
            const userData = await this.gerenciarCacheLeitura(`cache_user_${userId}`, "users", userId);
            if (userData) {
                if (userData.config) this.configGlobal = userData.config;
                if (userData.frota) this.frotaDefault = userData.frota;
            }
        }
        if (teamId) {
            const teamData = await this.gerenciarCacheLeitura(`cache_team_${teamId}`, "teams", teamId);
            if (teamData) {
                if (teamData.geoCache) this.geoCache = teamData.geoCache;
                if (teamData.preferencias) this.memoriaPreferencias = teamData.preferencias;
                if (teamData.members) this.teamMembers = teamData.members;
                if (teamData.locais) this.locaisSalvos = teamData.locais;
            }
        }
        document.dispatchEvent(new CustomEvent('dataSynced'));
    }

    async gerenciarCacheLeitura(storageKey, collectionName, docId) {
        const agora = Date.now();
        const cachedRaw = localStorage.getItem(storageKey);
        if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if ((agora - cached.timestamp) < this.CACHE_TTL) {
                console.log(`[Cache] Usando local para ${collectionName}`);
                return cached.data;
            }
        }
        try {
            const docRef = doc(this.db, collectionName, docId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                this.salvarCacheLocal(storageKey, data);
                return data;
            }
        } catch (e) { console.error("Erro rede:", e); if (cachedRaw) return JSON.parse(cachedRaw).data; }
        return null;
    }

    salvarCacheLocal(key, data) {
        try { localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data })); } catch (e) { }
    }

    atualizarCacheManual(key, novosDados) {
        const cachedRaw = localStorage.getItem(key);
        let data = cachedRaw ? JSON.parse(cachedRaw).data : {};
        this.salvarCacheLocal(key, { ...data, ...novosDados });
    }

    // --- INTELIGÊNCIA DE ROTAS ---

    aprenderPreferencia(origem, pedido, tipo, motivo = 'Manual') {
        if (!origem || !origem.lat) return;
        const k = `${origem.lat},${origem.lon}|${pedido.cliente}|${pedido.cidade}`;
        if (!this.memoriaPreferencias[k]) this.memoriaPreferencias[k] = [];
        this.memoriaPreferencias[k].push({ tipo, motivo, data: new Date().toISOString() });
    }

    consultarPreferencia(origem, pedido) {
        if (!origem || !origem.lat) return null;
        const k = `${origem.lat},${origem.lon}|${pedido.cliente}|${pedido.cidade}`;
        return this.memoriaPreferencias[k]?.at(-1)?.tipo || null;
    }

    async gerarViagensInteligentes(origem, pedidos, frota, conf, progressCb) {
        let frotaDisp = frota.map(v => ({ ...v })).filter(v => v.qtd > 0);
        const viagens = [];
        const backlog = [];
        const pedidosValidos = [];

        pedidos.forEach(p => {
            if (p.lat && p.lon) {
                p.dist = this.distanciaKm(origem.lat, origem.lon, p.lat, p.lon);
                p.visitado = false;
                pedidosValidos.push(p);
            } else {
                backlog.push({ ...p, motivo: 'Endereço não localizado' });
            }
        });

        pedidosValidos.sort((a, b) => b.dist - a.dist);
        const total = pedidosValidos.length;

        for (let i = 0; i < total; i++) {
            const p = pedidosValidos[i];
            if (i % 50 === 0 && progressCb) { await new Promise(r => setTimeout(r, 0)); progressCb(Math.round((i / total) * 100)); }
            if (p.visitado) continue;

            let encaixou = false;
            if (viagens.length > 0) {
                const ultimaViagem = viagens[viagens.length - 1];
                const v = ultimaViagem.veiculo;
                const primeiraEntrega = ultimaViagem.destinos[0];
                if ((ultimaViagem.pesoTotal + p.peso <= v.capKg) && (ultimaViagem.destinos.length < v.maxStops)) {
                    if (this.distanciaKm(primeiraEntrega.lat, primeiraEntrega.lon, p.lat, p.lon) < (conf.radiusKm || 150)) {
                        ultimaViagem.destinos.push(p);
                        ultimaViagem.pesoTotal += p.peso;
                        ultimaViagem.ocupacaoPct = (ultimaViagem.pesoTotal / v.capKg) * 100;
                        p.visitado = true;
                        encaixou = true;
                    }
                }
            }
            if (encaixou) continue;

            let melhorVeiculo = null;
            let melhorScore = -Infinity;

            for (const v of frotaDisp) {
                if (v.qtd <= 0 || p.peso > v.capKg) continue;
                let score = (p.peso / v.capKg) * 100;
                if (this.consultarPreferencia(origem, p) === v.tipo) score += 500;
                if (score > melhorScore) { melhorScore = score; melhorVeiculo = v; }
            }

            if (!melhorVeiculo) {
                backlog.push({ ...p, motivo: 'Sem veículo compatível' });
                continue;
            }

            melhorVeiculo.qtd--;
            p.visitado = true;
            const novaViagem = { id: Math.random().toString(36).slice(2), veiculo: { ...melhorVeiculo }, destinos: [p], pesoTotal: p.peso, ocupacaoPct: 0, origem };

            let vaga = true;
            while (vaga) {
                let vizinho = null;
                let menorDist = Infinity;
                const ultimo = novaViagem.destinos[novaViagem.destinos.length - 1];
                const refRaio = novaViagem.destinos[0];

                for (const cand of pedidosValidos) {
                    if (!cand.visitado && (cand.peso + novaViagem.pesoTotal <= novaViagem.veiculo.capKg) && (novaViagem.destinos.length < novaViagem.veiculo.maxStops)) {
                        const dRaio = this.distanciaKm(refRaio.lat, refRaio.lon, cand.lat, cand.lon);
                        if (dRaio < (conf.radiusKm || 150)) {
                            const dProx = this.distanciaKm(ultimo.lat, ultimo.lon, cand.lat, cand.lon);
                            if (dProx < menorDist) { menorDist = dProx; vizinho = cand; }
                        }
                    }
                }
                if (vizinho) { novaViagem.destinos.push(vizinho); novaViagem.pesoTotal += vizinho.peso; vizinho.visitado = true; } else { vaga = false; }
            }
            novaViagem.ocupacaoPct = (novaViagem.pesoTotal / novaViagem.veiculo.capKg) * 100;
            viagens.push(novaViagem);
        }
        return { viagens, backlog };
    }

    // --- CÁLCULOS E ROTEIRIZAÇÃO ---

    async roteirizarViagem(viagem, config) {
        if (!viagem.origem) return { distKm: 0 };
        const pontos = [viagem.origem, ...viagem.destinos];
        if (config.roundtrip) pontos.push(viagem.origem);

        const coords = pontos.map(p => `${p.lon},${p.lat}`).join(';');
        try {
            const r = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&roundtrip=false&overview=full&geometries=geojson`);
            const d = await r.json();
            if (d.trips && d.trips[0]) {
                const t = d.trips[0];
                const dist = t.distance / 1000;
                const custos = this.calcularCustos(viagem, dist, config);
                return { geometryIda: t.geometry, distKm: dist, ...custos };
            }
        } catch (e) { }
        return { distKm: 0, custoTotal: 0 };
    }

    calcularCustos(viagem, distKm, config) {
        const consumo = viagem.veiculo.consumo || 4;
        const dieselPrice = config.dieselPrice || 6.00;
        const litros = distKm / consumo;
        const custoDiesel = litros * dieselPrice;
        const valorKM = distKm * viagem.veiculo.eixos * 1.15;
        const custoTotal = valorKM + (viagem.veiculo.custoFixo || 0) + custoDiesel;
        return { custoDiesel, custoTotal, litros, tempoFormatado: `${Math.floor(distKm / 60)}h ${Math.floor(distKm % 60)}m` };
    }

    encontrarVeiculoIdeal(pesoTotal) {
        const frota = this.frotaDefault.filter(v => v.qtd > 0).sort((a, b) => a.capKg - b.capKg);
        if (frota.length === 0) return this.frotaDefault[0];
        const ideal = frota.find(v => v.capKg >= pesoTotal);
        return ideal ? { ...ideal } : { ...frota[frota.length - 1] };
    }

    distanciaKm(a, b, c, d) {
        const R = 6371; const dLat = (c - a) * Math.PI / 180; const dLon = (d - b) * Math.PI / 180;
        return R * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLon / 2) ** 2));
    }

    // --- SALVAMENTO ---
    async saveSettings(data) {
        if (!this.authService.currentUser) return;
        const uid = this.authService.currentUser.uid;
        const userRef = doc(this.db, "users", uid);
        await updateDoc(userRef, { config: data.config, frota: data.frota });
        this.configGlobal = data.config; this.frotaDefault = data.frota;
        this.atualizarCacheManual(`cache_user_${uid}`, { config: data.config, frota: data.frota });
    }

    async salvarLocal(nome, coords) {
        if (!this.authService.currentTeamId) return;
        const novoLocal = { id: Date.now(), nome, ...coords };
        const teamRef = doc(this.db, "teams", this.authService.currentTeamId);
        await updateDoc(teamRef, { locais: arrayUnion(novoLocal) });
        this.locaisSalvos.push(novoLocal);
        this.atualizarCacheManual(`cache_team_${this.authService.currentTeamId}`, { locais: this.locaisSalvos });
    }

    async removerLocal(id) {
        if (!this.authService.currentTeamId) return;
        const novaLista = this.locaisSalvos.filter(l => l.id !== id);
        const teamRef = doc(this.db, "teams", this.authService.currentTeamId);
        await updateDoc(teamRef, { locais: novaLista });
        this.locaisSalvos = novaLista;
        this.atualizarCacheManual(`cache_team_${this.authService.currentTeamId}`, { locais: this.locaisSalvos });
    }

    async salvarAprendizado() {
        if (!this.authService.currentTeamId) return;
        const teamRef = doc(this.db, "teams", this.authService.currentTeamId);
        await updateDoc(teamRef, { geoCache: this.geoCache, preferencias: this.memoriaPreferencias });
        this.atualizarCacheManual(`cache_team_${this.authService.currentTeamId}`, { geoCache: this.geoCache, preferencias: this.memoriaPreferencias });
    }

    // --- MEMBROS E UTILS ---
    async adicionarMembroEquipe(novoMembro) {
        if (!this.authService.currentTeamId) return;
        const teamRef = doc(this.db, "teams", this.authService.currentTeamId);
        await updateDoc(teamRef, { members: arrayUnion(novoMembro) });
        this.teamMembers.push(novoMembro);
        this.atualizarCacheManual(`cache_team_${this.authService.currentTeamId}`, { members: this.teamMembers });
        await setDoc(doc(this.db, "invites", novoMembro.email), {
            email: novoMembro.email, teamId: this.authService.currentTeamId,
            companyName: this.authService.currentUser.company || "Minha Empresa", role: novoMembro.role, jobTitle: novoMembro.jobTitle, invitedBy: this.authService.currentUser.name
        });
    }

    async removerMembroEquipe(membro) {
        if (!this.authService.currentTeamId) return;
        const teamRef = doc(this.db, "teams", this.authService.currentTeamId);
        await updateDoc(teamRef, { members: arrayRemove(membro) });
        this.teamMembers = this.teamMembers.filter(m => m.email !== membro.email);
        this.atualizarCacheManual(`cache_team_${this.authService.currentTeamId}`, { members: this.teamMembers });
        try { await deleteDoc(doc(this.db, "invites", membro.email)); } catch (e) { }
    }

    async editarMembroEquipe(oldData, newData) {
        if (!this.authService.currentTeamId) return;
        const teamRef = doc(this.db, "teams", this.authService.currentTeamId);
        await updateDoc(teamRef, { members: arrayRemove(oldData) });
        await updateDoc(teamRef, { members: arrayUnion(newData) });
        this.teamMembers = this.teamMembers.filter(m => m.email !== oldData.email); this.teamMembers.push(newData);
        this.atualizarCacheManual(`cache_team_${this.authService.currentTeamId}`, { members: this.teamMembers });
        try { await updateDoc(doc(this.db, "invites", newData.email), { role: newData.role, jobTitle: newData.jobTitle }); } catch (e) { }
    }

    async atualizarPerfilUsuario(uid, dados, teamId) {
        const userRef = doc(this.db, "users", uid);
        await updateDoc(userRef, dados);
        localStorage.removeItem(`cache_user_${uid}`);
        if (teamId && dados.company) {
            const teamRef = doc(this.db, "teams", teamId);
            try { await updateDoc(teamRef, { name: dados.company }); } catch (e) { }
        }
    }

    async verificarStatusEmail(email) {
        const m = this.teamMembers.find(x => x.email === email); if (m) return { status: 'JA_DA_EQUIPE', dados: m };
        const q = query(collection(this.db, "users"), where("email", "==", email));
        const s = await getDocs(q);
        return s.empty ? { status: 'NOVO' } : { status: 'EXISTE_NO_SISTEMA', dados: s.docs[0].data() };
    }

    async verificarConvitesPendentes(email) {
        if (!email) return null;
        try { const snap = await getDoc(doc(this.db, "invites", email)); return snap.exists() ? snap.data() : null; } catch (e) { return null; }
    }

    async aceitarConvite(invite) {
        const user = this.authService.currentUser; if (!user) return;
        const userRef = doc(this.db, "users", user.uid);
        await updateDoc(userRef, { teamId: invite.teamId, company: invite.companyName, role: invite.role, jobTitle: invite.jobTitle || 'Colaborador' });
        await deleteDoc(doc(this.db, "invites", invite.email));
        localStorage.removeItem(`cache_user_${user.uid}`);
        localStorage.removeItem(`cache_team_${invite.teamId}`);
    }

    async buscarCoordenadas(q) {
        if (!q || q.length < 5) return null;
        if (this.geoCache[q]) return this.geoCache[q];
        try {
            const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=br`, { headers: { 'User-Agent': 'FreteCalcSaaS/1.0' } });
            const d = await r.json();
            const res = d[0] ? { lat: +d[0].lat, lon: +d[0].lon } : null;
            if (res) this.geoCache[q] = res;
            return res;
        } catch (e) { return null; }
    }

    async geocodificarLote(l, cb) {
        const o = [];
        for (let i = 0; i < l.length; i++) {
            const p = l[i];
            if (!p.lat || !p.lon) {
                let c = null;
                const k = p.cliente && p.cidade ? `${p.cliente} | ${p.cidade}` : null;
                if (k && this.geoCache[k]) c = this.geoCache[k];
                if (!c) {
                    if (this.geoCache[p.endereco]) c = this.geoCache[p.endereco];
                    else { await new Promise(r => setTimeout(r, 1100)); c = await this.buscarCoordenadas(p.endereco); }
                }
                if (!c && p.bairro && p.cidade) {
                    const b = `${p.bairro}, ${p.cidade} - ${p.uf}, Brasil`;
                    if (this.geoCache[b]) c = this.geoCache[b]; else { await new Promise(r => setTimeout(r, 1100)); c = await this.buscarCoordenadas(b); }
                }
                if (!c && p.cidade) {
                    const z = `${p.cidade} - ${p.uf}, Brasil`;
                    if (this.geoCache[z]) c = this.geoCache[z]; else { await new Promise(r => setTimeout(r, 1100)); c = await this.buscarCoordenadas(z); }
                }
                if (c) {
                    p.lat = c.lat; p.lon = c.lon; this.geoCache[p.endereco] = c;
                    if (k && p.cliente.length > 2 && !p.cliente.toLowerCase().includes('diversos')) this.geoCache[k] = c;
                }
            }
            o.push(p);
            if (cb) cb(Math.round((i / l.length) * 100));
        }
        return o;
    }

    extrairCoordenadas(t) { if (!t) return null; const r = /(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/; let m = t.match(r); if (!m) { const r2 = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/; m = t.match(r2); } if (!m) { const r3 = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/; m = t.match(r3); } return m ? { lat: parseFloat(m[1]), lon: parseFloat(m[2]) } : null; }
    lerExcel(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => { try { const d = new Uint8Array(e.target.result); const w = XLSX.read(d, { type: 'array' }); const s = w.Sheets[w.SheetNames[0]]; res(XLSX.utils.sheet_to_json(s, { raw: true, defval: '' })); } catch (err) { rej(err); } }; r.onerror = rej; r.readAsArrayBuffer(f); }); }

    findValue(r, n) { const k = Object.keys(r); for (const x of n) { const f = k.find(y => y.trim().toLowerCase() === x.toLowerCase()); if (f) return r[f]; } return ''; }

    processarPlanilha(r) {
        return r.map((x, i) => {
            let w = this.findValue(x, ['peso', 'kg', 'peso bruto']);
            let kg = 0;
            if (typeof w === 'number') kg = w < 100 ? w * 1000 : w;
            else if (typeof w === 'string') { let raw = w.trim().replace(/\./g, '').replace(',', '.'); kg = parseFloat(raw) || 0; if (kg < 50 && kg > 0) kg *= 1000; }

            const ped = String(this.findValue(x, ['pedido', 'nf']) || `PED-${i}`);
            const cli = String(this.findValue(x, ['cliente', 'destinatario', 'nome cliente', 'nome do cliente', 'razao social']) || 'Diversos');
            const sup = String(this.findValue(x, ['supervisor', 'vendedor']) || '').trim();
            const cid = String(this.findValue(x, ['cidade', 'municipio']) || '').trim();
            const uf = String(this.findValue(x, ['uf', 'estado']) || '').trim().toUpperCase();
            const bar = String(this.findValue(x, ['bairro']) || '').trim();
            const end = String(this.findValue(x, ['endereço', 'rua']) || '').trim();
            const agd = String(this.findValue(x, ['agendamento']) || '').toUpperCase().includes('S');
            const stt = String(this.findValue(x, ['status', 'situacao']) || '');

            const full = (end && cid) ? `${end}, ${cid} - ${uf}, Brasil` : `${bar}, ${cid} - ${uf}, Brasil`;
            return { id: i, pedido: ped, cliente: cli, supervisor: sup, cidade: cid, uf, bairro: bar, endereco: full, peso: kg, agendado: agd, status: stt, lat: null, lon: null };
        });
    }
}