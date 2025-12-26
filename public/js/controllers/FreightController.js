import { AuthService } from '../services/AuthService.js';
import { FreightModel } from '../models/FreightModel.js';
import { FreightView } from '../views/FreightView.js';

class FreightController {
    constructor() {
        this.authService = new AuthService((user) => this.handleAuthState(user));
        this.model = new FreightModel(this.authService);
        this.view = new FreightView();

        this.todosPedidos = [];
        this.pedidosGeocodificados = [];
        this.resultadoCache = null;
        this.origemSelecionada = null;

        this.init();
        this.initAuthListeners();
        this.initProfileListeners();
    }

    // --- AUTENTICAÇÃO E PERFIL ---
    async handleAuthState(user) {
        const authScreen = document.getElementById('authScreen');
        const userInfo = document.getElementById('userInfoDisplay');

        if (user) {
            if (authScreen) authScreen.classList.add('d-none');

            if (userInfo) {
                const nome = user.name || user.displayName || 'Usuário';
                const empresa = user.company || 'Empresa';
                const cargo = user.jobTitle || user.role || 'Membro';
                const inicial = nome.charAt(0).toUpperCase();

                userInfo.innerHTML = `
                    <div class="d-flex align-items-center gap-2" title="Meu Perfil">
                        <div class="bg-primary rounded-circle text-white d-flex align-items-center justify-content-center shadow-sm" style="width:36px; height:36px; font-weight:bold;">
                            ${inicial}
                        </div>
                        <div style="line-height:1.2;">
                            <strong class="text-white">${nome}</strong><br>
                            <span class="text-white-50 x-small">${empresa} (${cargo})</span>
                        </div>
                    </div>
                `;
            }
            this.view.showToast(`Bem-vindo, ${user.name || user.displayName}!`);

            if (user.teamId) {
                this.model.iniciarSincronizacao(user.uid, user.teamId);
            }
            this.verificarConvites(user);
        } else {
            if (userInfo) userInfo.innerHTML = 'Saindo...';
        }
    }

    async verificarConvites(user) {
        try {
            const convite = await this.model.verificarConvitesPendentes(user.email);
            if (convite) {
                const aceitou = await this.view.showConfirm(
                    `<div class="text-center">
                        <i class="fas fa-envelope-open-text fa-3x text-primary mb-3"></i><br>
                        Você tem um convite para entrar na equipe:<br>
                        <h5 class="fw-bold my-2">${convite.companyName}</h5>
                        <small>Enviado por: ${convite.invitedBy}</small><br><br>
                        Deseja aceitar e trocar de equipe?
                    </div>`
                );

                if (aceitou) {
                    this.view.setLoading(true, "Mudando de equipe...");
                    await this.model.aceitarConvite(convite);
                    this.view.setLoading(false);
                    window.location.reload();
                }
            }
        } catch (e) {
            console.error("Erro convites:", e);
        }
    }

    initAuthListeners() {
        const btnLogout = document.getElementById('btnConfirmLogout');
        if (btnLogout) {
            btnLogout.onclick = async () => {
                btnLogout.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saindo...';
                try {
                    await this.authService.logout();
                    window.location.href = "login.html";
                } catch (e) {
                    alert("Erro ao sair.");
                }
            };
        }
    }

    initProfileListeners() {
        const userInfo = document.getElementById('userInfoDisplay');
        if (userInfo) {
            userInfo.addEventListener('click', () => {
                this.carregarDadosPerfil();
                const modalEl = document.getElementById('profileModal');
                if (modalEl) new bootstrap.Modal(modalEl).show();
            });
        }

        document.getElementById('btnSaveProfile')?.addEventListener('click', async () => {
            const user = this.authService.currentUser;
            const newPhone = document.getElementById('profPhone').value;
            const newJob = document.getElementById('profJobTitle').value;
            const newBranch = document.getElementById('profBranch').value;
            const newCompany = document.getElementById('profCompany').value;

            this.view.setLoading(true, "Atualizando...");
            try {
                await this.model.atualizarPerfilUsuario(
                    user.uid,
                    { phone: newPhone, jobTitle: newJob, branch: newBranch, company: newCompany },
                    user.teamId
                );

                this.authService.currentUser.phone = newPhone;
                this.authService.currentUser.jobTitle = newJob;
                this.authService.currentUser.branch = newBranch;
                this.authService.currentUser.company = newCompany;

                this.view.setLoading(false);
                this.view.showToast("Perfil atualizado!");
                this.handleAuthState(this.authService.currentUser);
            } catch (e) {
                this.view.setLoading(false);
                alert("Erro: " + e.message);
            }
        });

        document.getElementById('btnConfirmEditMember')?.addEventListener('click', async () => {
            const email = document.getElementById('editMemberEmail').value;
            const newJob = document.getElementById('editMemberJobTitle').value;
            const newRole = document.getElementById('editMemberRole').value;
            if (!email) return;
            const member = this.model.teamMembers.find(m => m.email === email);
            if (!member) return;
            const updatedMember = { ...member, jobTitle: newJob, role: newRole };
            this.view.setLoading(true, "Salvando...");
            try {
                await this.model.editarMembroEquipe(member, updatedMember);
                bootstrap.Modal.getInstance(document.getElementById('editMemberModal')).hide();
                this.view.setLoading(false);
                this.view.showToast("Atualizado!");
            } catch (e) { this.view.setLoading(false); alert("Erro: " + e.message); }
        });

        document.getElementById('btnAddMember')?.addEventListener('click', async () => {
            const name = document.getElementById('newMemberName').value;
            const email = document.getElementById('newMemberEmail').value.trim().toLowerCase();
            const job = document.getElementById('newMemberJobTitle').value;
            const role = document.getElementById('newMemberRole').value;

            if (!name || !email) return alert("Preencha nome e email.");

            this.view.setLoading(true, "Verificando...");
            try {
                const statusCheck = await this.model.verificarStatusEmail(email);
                this.view.setLoading(false);

                if (statusCheck.status === 'JA_DA_EQUIPE') {
                    return this.view.showModal(`O email <b>${email}</b> já está na equipe.`);
                }

                if (statusCheck.status === 'EXISTE_NO_SISTEMA') {
                    const userEncontrado = statusCheck.dados;
                    const confirmar = await this.view.showConfirm(
                        `<div class="text-center">
                            <i class="fas fa-user-check fa-3x text-success mb-3"></i><br>
                            O usuário <b>${userEncontrado.name}</b> já possui conta.<br><br>
                            Deseja enviar um convite para ele?
                        </div>`
                    );
                    if (!confirmar) return;
                }

                this.view.setLoading(true, "Enviando convite...");
                await this.model.adicionarMembroEquipe({
                    name: statusCheck.dados?.name || name,
                    email, jobTitle: job || 'Colaborador', role, addedAt: new Date().toISOString()
                });

                document.getElementById('newMemberName').value = '';
                document.getElementById('newMemberEmail').value = '';
                document.getElementById('newMemberJobTitle').value = '';
                this.view.setLoading(false);
                this.view.showToast(`Convite enviado para ${email}`);

            } catch (e) {
                this.view.setLoading(false);
                console.error(e);
                alert("Erro ao adicionar: " + e.message);
            }
        });
    }

    carregarDadosPerfil() {
        const user = this.authService.currentUser;
        if (!user) return;

        const setValue = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

        setValue('profName', user.name || user.displayName);
        setValue('profEmail', user.email);
        setValue('profPhone', user.phone);
        setValue('profJobTitle', user.jobTitle);
        setValue('profCompany', user.company);

        const elCompany = document.getElementById('profCompany');
        if (elCompany) {
            if (user.role === 'Admin') {
                elCompany.removeAttribute('disabled');
                elCompany.classList.add('border-primary');
            } else {
                elCompany.setAttribute('disabled', 'true');
                elCompany.classList.remove('border-primary');
            }
        }

        const selectBranch = document.getElementById('profBranch');
        if (selectBranch) {
            selectBranch.innerHTML = '<option value="">Selecione uma filial...</option>';
            if (this.model.locaisSalvos && this.model.locaisSalvos.length > 0) {
                this.model.locaisSalvos.forEach(local => {
                    const opt = document.createElement('option');
                    opt.value = local.nome;
                    opt.textContent = local.nome;
                    if (user.branch === local.nome) opt.selected = true;
                    selectBranch.appendChild(opt);
                });
            }
        }

        const elAccess = document.getElementById('profAccessLevel');
        if (elAccess) {
            const role = user.role ? user.role.toUpperCase() : 'MEMBRO';
            elAccess.value = role;
            elAccess.className = `form-control fw-bold ${role === 'ADMIN' ? 'text-danger' : 'text-success'}`;
        }

        const teamSection = document.getElementById('teamManagementSection');
        if (teamSection) {
            if (user.role === 'Admin') {
                teamSection.classList.remove('d-none');
                this.renderizarListaMembros();
            } else {
                teamSection.classList.add('d-none');
            }
        }
    }

    renderizarListaMembros() {
        const list = document.getElementById('teamMembersList');
        if (!list) return;
        const members = this.model.teamMembers || [];

        if (members.length === 0) {
            list.innerHTML = '<div class="text-center p-3 text-muted small">Nenhum membro adicional.</div>';
            return;
        }

        list.innerHTML = members.map(m => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <strong>${m.name}</strong> 
                    <span class="badge bg-light text-dark border ms-1">${m.jobTitle || 'Sem cargo'}</span><br>
                    <small class="text-muted">${m.email}</small> 
                    <span class="text-primary x-small fw-bold">(${m.role})</span>
                </div>
                <div class="d-flex gap-1">
                    <button class="btn btn-outline-primary btn-sm btn-edit-member" data-email="${m.email}" title="Editar">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm btn-remove-member" data-email="${m.email}" title="Remover">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.btn-remove-member').forEach(btn => {
            btn.onclick = async () => {
                if (confirm(`Remover ${btn.dataset.email}?`)) {
                    const mem = members.find(x => x.email === btn.dataset.email);
                    if (mem) await this.model.removerMembroEquipe(mem);
                }
            };
        });

        list.querySelectorAll('.btn-edit-member').forEach(btn => {
            btn.onclick = () => {
                const mem = members.find(x => x.email === btn.dataset.email);
                if (mem) {
                    document.getElementById('editMemberEmail').value = mem.email;
                    document.getElementById('editMemberNameDisplay').value = mem.name;
                    document.getElementById('editMemberJobTitle').value = mem.jobTitle || '';
                    document.getElementById('editMemberRole').value = mem.role || 'Operacional';
                    new bootstrap.Modal(document.getElementById('editMemberModal')).show();
                }
            };
        });
    }

    init() {
        document.addEventListener('dataSynced', () => {
            this.view.renderizarListaLocais(this.model.locaisSalvos);
            this.view.preencherConfig(this.model.configGlobal, this.model.frotaDefault);
            const modal = document.getElementById('profileModal');
            if (modal && modal.classList.contains('show')) this.renderizarListaMembros();
            this.view.showToast("Dados atualizados.");
        });

        this.view.setupSobre();

        const tabEls = document.querySelectorAll('button[data-bs-toggle="tab"]');
        tabEls.forEach(tab => {
            tab.addEventListener('shown.bs.tab', event => {
                const target = event.target.getAttribute('data-bs-target');
                if (target === '#data-pane') document.querySelector('.main-layout').classList.add('sidebar-full-width');
                else {
                    document.querySelector('.main-layout').classList.remove('sidebar-full-width');
                    setTimeout(() => { if (this.view.map) this.view.map.invalidateSize(); }, 300);
                }
            });
        });

        document.getElementById('btnSaveConfig')?.addEventListener('click', async () => {
            const data = { config: this.view.obterConfigGlobal(), frota: this.view.obterConfigFrota(this.model.frotaDefault) };
            this.view.setLoading(true, "Salvando...");
            await this.model.saveSettings(data);
            this.view.setLoading(false);
            this.view.showToast("Salvo!");
        });

        document.getElementById('btnResetConfig')?.addEventListener('click', async () => {
            if (await this.view.showConfirm("Recarregar dados?")) location.reload();
        });

        document.getElementById('btnAddLoc')?.addEventListener('click', async () => {
            const nome = document.getElementById('newLocName').value;
            const link = document.getElementById('newLocLink').value;
            let coords = this.model.extrairCoordenadas(link);
            if (!coords) {
                this.view.setLoading(true, "Buscando...");
                coords = await this.model.buscarCoordenadas(link);
                this.view.setLoading(false);
            }
            if (coords) {
                await this.model.salvarLocal(nome, coords);
                this.view.showToast("Salvo!");
                document.getElementById('newLocName').value = '';
                document.getElementById('newLocLink').value = '';
            } else { this.view.showModal("Endereço inválido."); }
        });

        document.getElementById('savedLocationsList')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-remove-loc');
            if (btn && confirm("Excluir local?")) await this.model.removerLocal(parseInt(btn.dataset.id));
        });

        document.getElementById('btnSelectOrigin')?.addEventListener('click', () => this.view.mostrarModalSelecao(this.model.locaisSalvos));
        document.getElementById('modalOriginList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-confirm-origin');
            if (btn) {
                this.origemSelecionada = { lat: parseFloat(btn.dataset.lat), lon: parseFloat(btn.dataset.lon), nome: btn.dataset.name };
                document.getElementById('origemInput').value = btn.dataset.name;
                bootstrap.Modal.getInstance(document.getElementById('originModal')).hide();
            }
        });

        document.getElementById('excelInput')?.addEventListener('change', async e => {
            if (!e.target.files.length) return;
            try {
                this.view.setLoading(true, "Processando Planilha...");
                await new Promise(r => setTimeout(r, 200));

                const json = await this.model.lerExcel(e.target.files[0]);
                const todos = this.model.processarPlanilha ? this.model.processarPlanilha(json) : [];
                if (todos.length === 0) throw new Error("A planilha está vazia ou ilegível.");

                this.view.setLoading(false);
                const statusUnicos = [...new Set(todos.map(p => p.status || ''))].sort();
                const sel = await this.view.solicitarFiltroStatus(statusUnicos);

                if (!sel) { e.target.value = ''; return; }

                this.view.setLoading(true, "Geocodificando Endereços...");
                this.todosPedidos = todos.filter(p => sel.includes(p.status || ''));
                this.view.renderizarTabelaDados(this.todosPedidos);

                this.pedidosGeocodificados = await this.model.geocodificarLote(this.todosPedidos, pct => {
                    const el = document.getElementById('loadingModalText');
                    if (el) el.innerText = `Processando: ${pct}%`;
                });

                if (this.pedidosGeocodificados.length > 0 && this.model.salvarAprendizado) {
                    await this.model.salvarAprendizado();
                }

                this.view.limparPreview();
                this.pedidosGeocodificados.forEach(p => this.view.adicionarPontoPreview(p));
                this.view.focarMapaNosPontos();

                this.view.setLoading(false);
                this.view.showToast(`${this.todosPedidos.length} pedidos carregados.`);
            } catch (err) {
                this.view.setLoading(false);
                console.error(err);
                this.view.showModal("Erro ao processar: " + err.message);
            } finally {
                e.target.value = '';
            }
        });

        document.getElementById('btnCalcular')?.addEventListener('click', () => this.processar());
        document.addEventListener('click', e => this.handleActions(e));
        document.addEventListener('change', e => this.handleChangeActions(e));

        document.addEventListener('routeOrderChanged', async (e) => {
            const { tripIdx, oldIdx, newIdx } = e.detail;
            const viagem = this.resultadoCache.viagens[tripIdx];
            if (viagem) {
                const [movido] = viagem.destinos.splice(oldIdx, 1);
                viagem.destinos.splice(newIdx, 0, movido);
                await this.recalcularRota(tripIdx);
            }
        });

        const dragbar = document.getElementById('dragbar');
        const sidebar = document.getElementById('sidebar');
        let isResizing = false;
        if (dragbar && sidebar) {
            dragbar.addEventListener('mousedown', (e) => { isResizing = true; document.body.style.cursor = 'col-resize'; e.preventDefault(); });
            document.addEventListener('mousemove', (e) => { if (isResizing) { const w = Math.min(Math.max(e.clientX, 300), 700); sidebar.style.width = `${w}px`; if (this.view.map) this.view.map.invalidateSize(); } });
            document.addEventListener('mouseup', () => { if (isResizing) { isResizing = false; document.body.style.cursor = 'default'; if (this.view.map) this.view.map.invalidateSize(); } });
        }
    }

    async processar() {
        const inputVal = document.getElementById('origemInput').value;
        if (!inputVal) return this.view.showModal("Informe o ponto de origem.");
        if (!this.pedidosGeocodificados.length) return this.view.showModal("Importe uma planilha primeiro.");
        try {
            this.view.setLoading(true, "Otimizando Rotas...");
            await new Promise(r => setTimeout(r, 500));
            let origem;
            if (this.origemSelecionada && this.origemSelecionada.nome === inputVal) origem = this.origemSelecionada;
            else origem = await this.model.buscarCoordenadas(inputVal);
            if (!origem) throw new Error("Origem não encontrada. Verifique o endereço.");

            const frota = this.view.obterConfigFrota(this.model.frotaDefault);
            const conf = this.view.obterConfigGlobal();

            this.resultadoCache = await this.model.gerarViagensInteligentes(origem, this.pedidosGeocodificados, frota, conf, pct => {
                const el = document.getElementById('loadingModalText');
                if (el) el.innerText = `Roteirizando: ${pct}%`;
            });

            this.view.limparMapa();
            this.view.desenharOrigem(origem.lat, origem.lon, inputVal);
            this.view.desenharPendentes(this.resultadoCache.backlog);
            this.view.desenharPendentesMap(this.resultadoCache.backlog);

            for (let i = 0; i < this.resultadoCache.viagens.length; i++) {
                await new Promise(r => setTimeout(r, 100));
                this.resultadoCache.viagens[i].rota = await this.model.roteirizarViagem(this.resultadoCache.viagens[i], conf);
            }
            this.view.renderizarResultados(this.resultadoCache, this.model.frotaDefault);
            if (this.resultadoCache.viagens.length > 0) this.view.desenharRota(this.resultadoCache.viagens[0], conf);

        } catch (e) { this.view.showModal(e.message); } finally { this.view.setLoading(false); }
    }

    async recalcularRota(idx) {
        this.view.setLoading(true, "Recalculando...");
        try {
            const conf = this.view.obterConfigGlobal();
            const viagem = this.resultadoCache.viagens[idx];
            if (viagem) {
                if (viagem.destinos.length === 0) this.resultadoCache.viagens.splice(idx, 1);
                else {
                    viagem.rota = await this.model.roteirizarViagem(viagem, conf);
                    this.view.desenharRota(viagem, conf);
                }
            }
            this.view.renderizarResultados(this.resultadoCache, this.model.frotaDefault);
        } catch (e) { } finally { this.view.setLoading(false); }
    }

    async handleActions(e) {
        // A. REMOVER PEDIDO
        const btnRemove = e.target.closest('.btn-remove-order');
        if (btnRemove) {
            e.stopPropagation();
            const t = +btnRemove.dataset.trip;
            const p = +btnRemove.dataset.ped;
            if (await this.view.showConfirm("Remover pedido desta rota?")) {
                const pedido = this.resultadoCache.viagens[t].destinos.splice(p, 1)[0];
                this.resultadoCache.viagens[t].pesoTotal -= pedido.peso;
                this.resultadoCache.backlog.push({ ...pedido, motivo: 'Removido Manualmente' });
                this.verificarTrocaVeiculoAuto(this.resultadoCache.viagens[t]);
                this.view.desenharPendentes(this.resultadoCache.backlog);
                this.view.desenharPendentesMap(this.resultadoCache.backlog);
                await this.recalcularRota(t);
            }
            return;
        }

        // B. ADICIONAR MANUALMENTE (NOVO)
        const btnManualAdd = e.target.closest('.btn-manual-add');
        if (btnManualAdd) {
            e.stopPropagation();
            const pedIdx = +btnManualAdd.dataset.pedIdx;
            const input = document.getElementById(`manualRoute_${pedIdx}`);
            const rotaNum = parseInt(input.value);

            if (!rotaNum || rotaNum < 1 || !this.resultadoCache || rotaNum > this.resultadoCache.viagens.length) {
                return this.view.showToast("Número da rota inválido.", "error");
            }

            const tripIdx = rotaNum - 1;
            const viagemDestino = this.resultadoCache.viagens[tripIdx];

            // Move e Recalcula
            const pedido = this.resultadoCache.backlog.splice(pedIdx, 1)[0];
            viagemDestino.destinos.push(pedido);
            viagemDestino.pesoTotal += pedido.peso;

            this.view.showToast(`Pedido movido para Rota ${rotaNum}`);
            this.verificarTrocaVeiculoAuto(viagemDestino);
            this.view.desenharPendentes(this.resultadoCache.backlog);
            this.view.desenharPendentesMap(this.resultadoCache.backlog);
            await this.recalcularRota(tripIdx);
            return;
        }

        // C. AÇÕES GERAIS (Print e Click Card)
        const btnPrint = e.target.closest('.btn-print');
        if (btnPrint) { e.stopPropagation(); this.view.imprimirManifesto(this.resultadoCache.viagens[+btnPrint.dataset.idx], +btnPrint.dataset.idx); return; }
        const card = e.target.closest('.trip-card');
        if (card && !e.target.matches('select') && !e.target.closest('button') && !e.target.matches('input')) {
            const idx = +card.dataset.idx;
            const conf = this.view.obterConfigGlobal();
            this.view.desenharRota(this.resultadoCache.viagens[idx], conf);
            document.querySelectorAll('.trip-card').forEach(c => c.classList.remove('border-primary', 'border-2'));
            card.classList.add('border-primary', 'border-2');
        }
    }

    // --- NOVO: LÓGICA DE APRENDIZADO NA TROCA DE VEÍCULO ---
    async handleChangeActions(e) {
        if (e.target.classList.contains('select-vehicle-change')) {
            const idx = +e.target.dataset.tripIdx;
            const novoTipo = e.target.value;
            const viagem = this.resultadoCache.viagens[idx];

            if (viagem && viagem.veiculo.tipo !== novoTipo) {
                const novoVeiculoConfig = this.model.frotaDefault.find(v => v.tipo === novoTipo);

                if (novoVeiculoConfig) {
                    // 1. Atualiza e Recalcula
                    viagem.veiculo = { ...novoVeiculoConfig };
                    viagem.ocupacaoPct = (viagem.pesoTotal / viagem.veiculo.capKg) * 100;
                    await this.recalcularRota(idx);

                    // 2. Dispara o Loop de Aprendizado
                    setTimeout(async () => {
                        const isPaletizada = await this.view.showConfirm(
                            `<div class="text-center">
                                <i class="fas fa-pallet fa-3x text-primary mb-3"></i><br>
                                <h5>Aprendizado de Frota</h5>
                                <p>A carga é <b>Paletizada</b>?<br>Isso define preferência por <b>${novoTipo}</b>.</p>
                            </div>`
                        );

                        let motivo = null;
                        if (isPaletizada) {
                            motivo = 'Carga Paletizada';
                        } else {
                            const isExclusivo = await this.view.showConfirm(
                                `<div class="text-center">
                                    <i class="fas fa-stopwatch fa-3x text-warning mb-3"></i><br>
                                    <h5>Aprendizado de Frota</h5>
                                    <p>É entrega <b>Agendada / Exclusiva</b>?<br>Isso fixa preferência por <b>${novoTipo}</b>.</p>
                                </div>`
                            );
                            if (isExclusivo) motivo = 'Veículo Exclusivo';
                        }

                        if (motivo) {
                            this.view.setLoading(true, "Salvando preferências...");
                            viagem.destinos.forEach(d => this.model.aprenderPreferencia(viagem.origem, d, novoTipo, motivo));
                            await this.model.salvarAprendizado();
                            this.view.setLoading(false);
                            this.view.showToast(`Preferência salva para ${viagem.destinos.length} clientes.`);
                        }
                    }, 500);
                }
            }
        }
    }

    verificarTrocaVeiculoAuto(viagem) {
        const veiculoIdeal = this.model.encontrarVeiculoIdeal(viagem.pesoTotal);
        if (veiculoIdeal.tipo !== viagem.veiculo.tipo) {
            viagem.veiculo = { ...veiculoIdeal };
            viagem.ocupacaoPct = (viagem.pesoTotal / viagem.veiculo.capKg) * 100;
            this.view.showToast(`Veículo ajustado: ${veiculoIdeal.tipo}`);
        }
    }
}

new FreightController();