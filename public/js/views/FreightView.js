export class FreightView {
    constructor() {
        this.map = null;
        this.markers = [];     // Marcadores de clientes
        this.routeLayers = []; // Linhas de rota
        this.originLayer = null; // Marcador da origem
        this.radiusLayer = null; // Círculo do raio
        this.initMap();
    }

    initMap() {
        if (document.getElementById('map')) {
            this.map = L.map('map').setView([-23.5505, -46.6333], 10); // Default SP
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(this.map);
        }
    }

    // --- FUNÇÕES DE LIMPEZA E ESTADO ---
    setLoading(ativo, texto = "Carregando...") {
        const modal = document.getElementById('loadingModal');
        const backdrop = document.getElementById('loadingBackdrop');
        const txt = document.getElementById('loadingModalText');
        if (ativo) {
            if (txt) txt.innerText = texto;
            if (backdrop) backdrop.classList.remove('d-none');
            if (modal) { modal.classList.add('show'); modal.style.display = 'block'; }
        } else {
            if (backdrop) backdrop.classList.add('d-none');
            if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
        }
    }

    showToast(msg, tipo = 'success') {
        const toastEl = document.getElementById('liveToast');
        const toastBody = document.getElementById('toastMessage');
        if (toastEl && toastBody) {
            toastBody.innerText = msg;
            toastEl.className = `toast align-items-center text-white border-0 ${tipo === 'error' ? 'bg-danger' : 'bg-success'}`;
            new bootstrap.Toast(toastEl).show();
        }
    }

    showModal(msg) {
        const body = document.getElementById('genericModalBody');
        if (body) body.innerHTML = msg;
        const el = document.getElementById('genericModal');
        if (el) new bootstrap.Modal(el).show();
    }

    showConfirm(htmlMessage) {
        return new Promise((resolve) => {
            const modalEl = document.getElementById('confirmModal');
            const body = document.getElementById('confirmModalBody');
            const btnConfirm = document.getElementById('btnConfirmAction');
            if (!modalEl || !body || !btnConfirm) return resolve(confirm(htmlMessage.replace(/<[^>]*>?/gm, '')));
            body.innerHTML = htmlMessage;
            const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
            const newBtn = btnConfirm.cloneNode(true);
            btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
            newBtn.onclick = () => { modal.hide(); resolve(true); };
            modalEl.addEventListener('hidden.bs.modal', () => resolve(false), { once: true });
            modal.show();
        });
    }

    // --- MAPA: ELEMENTOS VISUAIS ---

    limparMapa() {
        // Remove tudo exceto o tile layer base
        this.markers.forEach(m => this.map.removeLayer(m));
        this.routeLayers.forEach(l => this.map.removeLayer(l));
        if (this.originLayer) this.map.removeLayer(this.originLayer);
        if (this.radiusLayer) this.map.removeLayer(this.radiusLayer);

        this.markers = [];
        this.routeLayers = [];
        this.originLayer = null;
        this.radiusLayer = null;
    }

    desenharOrigem(lat, lon, nome, raioKm) {
        if (!lat || !lon) return;

        // 1. Pino da Origem (Vermelho ou Ícone de Armazém)
        const icon = L.divIcon({
            html: '<i class="fas fa-warehouse fa-2x text-danger" style="text-shadow: 2px 2px 2px white;"></i>',
            className: 'custom-div-icon',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });

        this.originLayer = L.marker([lat, lon], { icon: icon }).addTo(this.map)
            .bindPopup(`<b>Origem:</b> ${nome}`).openPopup();

        // 2. Círculo do Raio
        if (raioKm > 0) {
            this.radiusLayer = L.circle([lat, lon], {
                color: '#3388ff',
                fillColor: '#3388ff',
                fillOpacity: 0.1,
                radius: raioKm * 1000 // Metros
            }).addTo(this.map);
            // Ajusta o zoom para caber o raio
            this.map.fitBounds(this.radiusLayer.getBounds());
        } else {
            this.map.setView([lat, lon], 12);
        }
    }

    desenharRota(viagem) {
        // Limpa anteriores
        this.routeLayers.forEach(l => this.map.removeLayer(l));
        this.markers.forEach(m => this.map.removeLayer(m));
        this.routeLayers = [];
        this.markers = [];

        if (!viagem || !viagem.destinos) return;

        // Desenha Marcadores
        viagem.destinos.forEach((d, i) => {
            const icon = L.divIcon({
                html: `<div class="badge bg-primary rounded-circle border border-white" style="width:24px;height:24px;line-height:20px;font-size:12px;">${i + 1}</div>`,
                className: 'marker-count-icon',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            const content = `
                <div style="min-width: 200px; font-size: 0.85rem; line-height: 1.5;">
                    <div class="border-bottom pb-1 mb-1 fw-bold text-primary">Entrega #${i + 1}</div>
                    <strong>N° Pedido:</strong> ${d.pedido}<br>
                    <strong>Cliente:</strong> ${d.cliente}<br>
                    <strong>Supervisor:</strong> ${d.supervisor || '--'}<br>
                    <strong>Peso:</strong> ${d.peso} kg<br>
                    <strong>Bairro:</strong> ${d.bairro || '--'}<br>
                    <strong>Cidade/UF:</strong> ${d.cidade}/${d.uf}<br>
                    <strong>Status:</strong> ${d.status || '--'}
                </div>
            `;

            const m = L.marker([d.lat, d.lon], { icon }).addTo(this.map).bindPopup(content);
            this.markers.push(m);
        });

        // Desenha Linhas (Mantido igual)
        if (viagem.rota && viagem.rota.geometryIda) {
            const coords = L.GeoJSON.coordsToLatLngs(viagem.rota.geometryIda.coordinates);
            const poly = L.polyline(coords, { color: 'blue', weight: 5, opacity: 0.7 }).addTo(this.map);
            this.routeLayers.push(poly);
            this.map.fitBounds(poly.getBounds().pad(0.1));

            if (viagem.destinos.length > 0 && viagem.origem) {
                const last = viagem.destinos[viagem.destinos.length - 1];
                const returnLine = L.polyline(
                    [[last.lat, last.lon], [viagem.origem.lat, viagem.origem.lon]],
                    { color: 'green', dashArray: '10, 10', weight: 4, opacity: 0.8 }
                ).addTo(this.map);
                this.routeLayers.push(returnLine);
            }
        }
    }

    // 3. PENDENTES (Pontos Verdes)
    desenharPendentesMap(backlog) {
        backlog.forEach(p => {
            if (p.lat && p.lon) {
                const icon = L.divIcon({
                    html: '<i class="fas fa-circle text-success" style="font-size:10px; border:1px solid white; border-radius:50%;"></i>',
                    className: 'backlog-icon',
                    iconSize: [10, 10]
                });

                const content = `
                    <div style="min-width: 200px; font-size: 0.85rem; line-height: 1.5;">
                        <div class="border-bottom pb-1 mb-1 fw-bold text-danger">Pendente (Não Roteirizado)</div>
                        <strong>Motivo:</strong> ${p.motivo}<br>
                        <hr class="my-1">
                        <strong>N° Pedido:</strong> ${p.pedido}<br>
                        <strong>Cliente:</strong> ${p.cliente}<br>
                        <strong>Supervisor:</strong> ${p.supervisor || '--'}<br>
                        <strong>Peso:</strong> ${p.peso} kg<br>
                        <strong>Bairro:</strong> ${p.bairro || '--'}<br>
                        <strong>Cidade/UF:</strong> ${p.cidade}/${p.uf}<br>
                        <strong>Status:</strong> ${p.status || '--'}
                    </div>
                `;

                const m = L.marker([p.lat, p.lon], { icon }).addTo(this.map).bindPopup(content);
                this.markers.push(m);
            }
        });
    }

    desenharPendentesMap(backlog) {
        // Mostra os pontos verdes no mapa para quem ficou de fora
        backlog.forEach(p => {
            if (p.lat && p.lon) {
                const icon = L.divIcon({
                    html: '<i class="fas fa-circle text-success" style="font-size:10px; border:1px solid white; border-radius:50%;"></i>',
                    className: 'backlog-icon',
                    iconSize: [10, 10]
                });
                const m = L.marker([p.lat, p.lon], { icon }).addTo(this.map)
                    .bindPopup(`<b>Pendente:</b> ${p.cliente}<br>${p.motivo}`);
                this.markers.push(m);
            }
        });
    }

    // --- RENDERIZAÇÃO DE INTERFACE (CARDS) ---

    renderizarResultados(cache, frota) {
        const container = document.getElementById('resultsContainer');
        if (!container || !cache) return;
        container.innerHTML = '';

        if (cache.viagens.length === 0) {
            container.innerHTML = '<div class="text-center mt-5">Nenhuma rota gerada. Verifique os pendentes.</div>';
            return;
        }

        cache.viagens.forEach((v, idx) => {
            const destinosHtml = v.destinos.map((d, i) => `
                <tr class="draggable-row" data-id="${d.id}">
                    <td style="width:30px;"><span class="badge bg-secondary rounded-pill">${i + 1}</span></td>
                    <td><div class="fw-bold small text-truncate" style="max-width:120px;">${d.cliente}</div><div class="x-small text-muted">${d.cidade}</div></td>
                    <td class="text-end small">${d.peso}kg</td>
                    <td class="text-end"><button class="btn btn-link text-danger p-0 btn-remove-order" data-trip="${idx}" data-ped="${i}"><i class="fas fa-times"></i></button></td>
                </tr>
            `).join('');

            const optionsVeiculo = frota.map(f => `<option value="${f.tipo}" ${f.tipo === v.veiculo.tipo ? 'selected' : ''}>${f.tipo}</option>`).join('');

            // Calculo Estimado de Pedágio (R$ 0,15 por eixo a cada 100km - Exemplo simples visual)
            const pedagioEstimado = v.rota ? (v.rota.distKm * 0.15 * v.veiculo.eixos).toFixed(2) : '0.00';

            container.innerHTML += `
                <div class="card mb-3 shadow-sm trip-card border-0" data-idx="${idx}">
                    <div class="card-header py-2 ${v.ocupacaoPct > 100 ? 'bg-danger text-white' : 'bg-primary text-white'}">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="fw-bold"><i class="fas fa-route"></i> Rota ${idx + 1}</div>
                            <select class="form-select form-select-sm select-vehicle-change text-dark" data-trip-idx="${idx}" style="width:120px; font-size:0.8rem;">
                                ${optionsVeiculo}
                            </select>
                        </div>
                    </div>
                    <div class="card-body p-2 bg-light">
                        <div class="row g-1 text-center mb-2 small">
                            <div class="col-3 border-end">
                                <div class="text-muted x-small">Entregas</div>
                                <div class="fw-bold text-dark">${v.destinos.length}</div>
                            </div>
                            <div class="col-3 border-end">
                                <div class="text-muted x-small">Distância</div>
                                <div class="fw-bold text-dark">${v.rota ? v.rota.distKm.toFixed(1) : 0} km</div>
                            </div>
                            <div class="col-3 border-end">
                                <div class="text-muted x-small">Diesel</div>
                                <div class="fw-bold text-dark">R$ ${v.rota ? v.rota.custoDiesel.toFixed(0) : 0}</div>
                            </div>
                            <div class="col-3">
                                <div class="text-muted x-small">Total</div>
                                <div class="fw-bold text-success">R$ ${v.rota ? v.rota.custoTotal.toFixed(0) : 0}</div>
                            </div>
                        </div>
                        
                        <div class="d-flex justify-content-between px-2 mb-2 x-small text-muted border-top pt-1">
                            <span><i class="fas fa-weight-hanging"></i> ${v.pesoTotal}kg (${v.ocupacaoPct.toFixed(0)}%)</span>
                            <span><i class="fas fa-road"></i> Pedágio (Est): R$ ${pedagioEstimado}</span>
                        </div>

                        <div class="table-responsive bg-white border rounded" style="max-height: 150px; overflow-y: auto;">
                            <table class="table table-sm table-hover mb-0 table-orders">
                                <tbody>${destinosHtml}</tbody>
                            </table>
                        </div>
                        
                        <div class="d-flex justify-content-end mt-2">
                            <button class="btn btn-sm btn-outline-dark btn-print w-100" data-idx="${idx}"><i class="fas fa-print me-1"></i> Imprimir Manifesto</button>
                        </div>
                    </div>
                </div>
            `;
        });

        // Reativa Drag and Drop
        document.querySelectorAll('.table-orders tbody').forEach((el, tripIdx) => {
            new Sortable(el, {
                animation: 150,
                ghostClass: 'bg-light',
                handle: '.draggable-row', // Pode arrastar pela linha
                onEnd: (evt) => {
                    document.dispatchEvent(new CustomEvent('routeOrderChanged', {
                        detail: { tripIdx: tripIdx, oldIdx: evt.oldIndex, newIdx: evt.newIndex }
                    }));
                }
            });
        });
    }

    desenharPendentes(backlog) {
        const container = document.getElementById('backlogContainer');
        const badge = document.getElementById('backlogBadge');
        if (!container) return;

        badge.innerText = backlog.length;
        if (backlog.length === 0) {
            container.innerHTML = '<div class="text-center text-muted mt-5 opacity-50"><i class="fas fa-check-circle fa-3x mb-3"></i><p class="small">Tudo roteirizado!</p></div>';
            return;
        }

        container.innerHTML = backlog.map((p, i) => `
            <div class="backlog-item p-2 mb-2 bg-white border-start border-4 border-warning shadow-sm">
                <div class="d-flex justify-content-between">
                    <strong class="text-truncate" style="max-width:150px;">${p.pedido}</strong>
                    <span class="badge bg-light text-dark border">${p.peso}kg</span>
                </div>
                <div class="small text-muted text-truncate">${p.cliente}</div>
                <div class="x-small text-danger mt-1">Motivo: ${p.motivo}</div>
            </div>
        `).join('');
    }

    // --- MANTIDOS (Config, Tabelas, Excel, etc) ---
    renderizarListaLocais(locais) {
        const lista = document.getElementById('savedLocationsList');
        if (!lista) return;
        lista.innerHTML = '';
        if (!locais || !locais.length) { lista.innerHTML = '<div class="text-center p-3 text-muted small">Nenhum local salvo.</div>'; return; }
        locais.forEach(l => {
            lista.innerHTML += `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div><strong>${l.nome}</strong><br><small class="text-muted">${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}</small></div>
                    <div class="d-flex gap-1"><button class="btn btn-outline-primary btn-sm btn-confirm-origin" data-lat="${l.lat}" data-lon="${l.lon}" data-name="${l.nome}"><i class="fas fa-check"></i></button><button class="btn btn-outline-danger btn-sm btn-remove-loc" data-id="${l.id}"><i class="fas fa-trash"></i></button></div>
                </div>`;
        });
    }

    preencherConfig(conf, frota) {
        if (conf) {
            if (document.getElementById('radiusInput')) document.getElementById('radiusInput').value = conf.radiusKm || 200;
            if (document.getElementById('dieselPrice')) document.getElementById('dieselPrice').value = conf.dieselPrice || 6.00;
            if (document.getElementById('unloadTime')) document.getElementById('unloadTime').value = conf.unloadTime || 45;
        }
        this.renderizarTabelaFrota(frota);
    }

    renderizarTabelaFrota(frota) {
        const tbody = document.getElementById('fleetTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!frota) return;
        frota.forEach((v) => {
            tbody.innerHTML += `
                <tr>
                    <td><input type="checkbox" checked disabled></td>
                    <td class="text-start fw-bold">${v.tipo}</td>
                    <td><input type="number" class="form-control form-control-sm text-center p-0" value="${v.capKg}" disabled></td>
                    <td><input type="number" class="form-control form-control-sm text-center p-0" value="${v.qtd}"></td>
                    <td><input type="number" class="form-control form-control-sm text-center p-0" value="${v.maxStops}"></td>
                    <td><input type="number" class="form-control form-control-sm text-center p-0" value="${v.custoFixo}"></td>
                    <td><input type="number" class="form-control form-control-sm text-center p-0" value="${v.consumo}"></td>
                    <td><input type="number" class="form-control form-control-sm text-center p-0" value="${v.eixos}" disabled></td>
                </tr>
            `;
        });
    }

    obterConfigGlobal() {
        return {
            radiusKm: parseFloat(document.getElementById('radiusInput')?.value) || 200,
            dieselPrice: parseFloat(document.getElementById('dieselPrice')?.value) || 6.00,
            unloadTime: parseFloat(document.getElementById('unloadTime')?.value) || 45,
            roundtrip: document.getElementById('returnToOrigin')?.checked || false,
            prioritizeSmall: document.getElementById('prioritizeSmall')?.checked || false
        };
    }

    obterConfigFrota(frotaOriginal) {
        const linhas = document.querySelectorAll('#fleetTableBody tr');
        const novaFrota = [];
        linhas.forEach((tr, i) => {
            const inputs = tr.querySelectorAll('input');
            const v = { ...frotaOriginal[i] };
            v.qtd = parseInt(inputs[2].value);
            v.maxStops = parseInt(inputs[3].value);
            v.custoFixo = parseFloat(inputs[4].value);
            v.consumo = parseFloat(inputs[5].value);
            novaFrota.push(v);
        });
        return novaFrota;
    }

    mostrarModalSelecao(locais) {
        const list = document.getElementById('modalOriginList');
        if (!list) return;
        list.innerHTML = '';
        locais.forEach(l => {
            list.innerHTML += `<button class="list-group-item list-group-item-action btn-confirm-origin" data-lat="${l.lat}" data-lon="${l.lon}" data-name="${l.nome}"><strong>${l.nome}</strong></button>`;
        });
        new bootstrap.Modal(document.getElementById('originModal')).show();
    }

    async solicitarFiltroStatus(statusList) {
        return new Promise(resolve => {
            const list = document.getElementById('statusFilterList');
            list.innerHTML = statusList.map(s => `
                <div class="form-check">
                    <input class="form-check-input status-chk" type="checkbox" value="${s}" id="st_${s}" checked>
                    <label class="form-check-label small" for="st_${s}">${s || '(Vazio)'}</label>
                </div>
            `).join('');
            const modalEl = document.getElementById('statusModal');
            const modal = new bootstrap.Modal(modalEl);
            const btnConfirm = document.getElementById('btnConfirmStatus');
            const newBtn = btnConfirm.cloneNode(true);
            btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
            newBtn.onclick = () => {
                const selected = Array.from(document.querySelectorAll('.status-chk:checked')).map(cb => cb.value);
                modal.hide();
                resolve(selected);
            };
            document.getElementById('btnCancelStatus').onclick = () => { modal.hide(); resolve(null); };
            modal.show();
        });
    }

    renderizarTabelaDados(pedidos) {
        const tbody = document.querySelector('#dataTable tbody');
        if (!tbody) return;
        tbody.innerHTML = pedidos.map(p => `<tr><td>${p.pedido}</td><td>${p.supervisor}</td><td>${p.cliente}</td><td>${p.bairro}</td><td>${p.cidade}/${p.uf}</td><td>${p.peso}</td><td>${p.agendado ? 'SIM' : ''}</td><td>${p.status}</td></tr>`).join('');
    }

    limparPreview() {
        this.limparMapa();
    }

    adicionarPontoPreview(p) {
        if (p.lat && p.lon) {
            const content = `
                <div style="min-width: 200px; font-size: 0.85rem; line-height: 1.5;">
                    <div class="border-bottom pb-1 mb-1 fw-bold text-primary">Detalhes do Pedido</div>
                    <strong>N° Pedido:</strong> ${p.pedido}<br>
                    <strong>Cliente:</strong> ${p.cliente}<br>
                    <strong>Supervisor:</strong> ${p.supervisor || '--'}<br>
                    <strong>Peso:</strong> ${p.peso} kg<br>
                    <strong>Bairro:</strong> ${p.bairro || '--'}<br>
                    <strong>Cidade/UF:</strong> ${p.cidade}/${p.uf}<br>
                    <strong>Status:</strong> ${p.status || '--'}
                </div>
            `;
            const m = L.marker([p.lat, p.lon]).addTo(this.map).bindPopup(content);
            this.markers.push(m);
        }
    }

    focarMapaNosPontos() {
        if (this.markers.length) {
            const group = new L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    imprimirManifesto(viagem, idx) {
        const w = window.open('', '', 'width=800,height=600');
        w.document.write(`
            <html><head><title>Manifesto Rota ${idx + 1}</title>
            <style>body{font-family:sans-serif; padding:20px;} table{width:100%; border-collapse:collapse; margin-top:20px;} th,td{border:1px solid #ddd; padding:8px; text-align:left;} th{background-color:#f2f2f2;}</style>
            </head><body>
            <h2>Manifesto de Carga - Rota ${idx + 1}</h2>
            <p><strong>Veículo:</strong> ${viagem.veiculo.tipo} | <strong>Peso Total:</strong> ${viagem.pesoTotal}kg</p>
            <p><strong>Custo Estimado:</strong> R$ ${viagem.rota ? viagem.rota.custoTotal.toFixed(2) : '0.00'}</p>
            <table>
                <thead><tr><th>Seq</th><th>Pedido</th><th>Cliente</th><th>Endereço</th><th>Cidade</th><th>Peso</th></tr></thead>
                <tbody>
                    ${viagem.destinos.map((d, i) => `<tr><td>${i + 1}</td><td>${d.pedido}</td><td>${d.cliente}</td><td>${d.endereco}</td><td>${d.cidade}</td><td>${d.peso}kg</td></tr>`).join('')}
                </tbody>
            </table>
            <script>window.print();</script>
            </body></html>
        `);
        w.document.close();
    }

    setupSobre() {
        if (document.getElementById('btnOpenAbout')) {
            document.getElementById('btnOpenAbout').onclick = () => {
                this.showModal(`<h5>FreteCalc SaaS</h5><p>Versão 2.5 (Visual Master)</p><p>Desenvolvido para gestão logística.</p>`);
            };
        }
    }
}