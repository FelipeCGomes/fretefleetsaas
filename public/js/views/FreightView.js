export class FreightView {
    constructor() {
        this.map = null;
        this.markers = [];
        this.routeLayers = [];
        this.originLayer = null;
        this.radiusLayers = [];
        this.initMap();
    }

    initMap() {
        if (document.getElementById('map')) {
            this.map = L.map('map').setView([-23.5505, -46.6333], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(this.map);
        }
    }

    // --- FUNÇÕES GERAIS ---
    setLoading(ativo, htmlContent = "Carregando...") {
        const modal = document.getElementById('loadingModal');
        const backdrop = document.getElementById('loadingBackdrop');
        const txt = document.getElementById('loadingModalText');

        if (ativo) {
            if (txt) txt.innerHTML = htmlContent; // Usa innerHTML para permitir formatação
            if (backdrop) backdrop.classList.remove('d-none');
            if (modal) {
                modal.classList.add('show');
                modal.style.display = 'block';
            }
        } else {
            if (backdrop) backdrop.classList.add('d-none');
            if (modal) {
                modal.classList.remove('show');
                modal.style.display = 'none';
            }
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

    // --- MAPA ---

    limparMapa() {
        this.markers.forEach(m => this.map.removeLayer(m));
        this.routeLayers.forEach(l => this.map.removeLayer(l));
        this.radiusLayers.forEach(r => this.map.removeLayer(r));
        if (this.originLayer) this.map.removeLayer(this.originLayer);

        this.markers = [];
        this.routeLayers = [];
        this.radiusLayers = [];
        this.originLayer = null;
    }

    limparPreview() {
        this.limparMapa();
    }

    desenharOrigem(lat, lon, nome) {
        if (!lat || !lon) return;
        const icon = L.divIcon({
            html: '<i class="fas fa-warehouse fa-2x text-danger" style="text-shadow: 2px 2px 2px white;"></i>',
            className: 'custom-div-icon',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        this.originLayer = L.marker([lat, lon], { icon }).addTo(this.map).bindPopup(`<b>Origem / CD</b><br>${nome}`).openPopup();
        this.map.setView([lat, lon], 12);
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

    desenharRota(viagem, configGlobal) {
        this.limparMapa();
        if (viagem.origem) this.desenharOrigem(viagem.origem.lat, viagem.origem.lon, 'Origem');

        if (!viagem || !viagem.destinos) return;

        if (viagem.destinos.length > 0) {
            const primeira = viagem.destinos[0];
            const raioKm = configGlobal ? configGlobal.radiusKm : 100;
            const circulo = L.circle([primeira.lat, primeira.lon], {
                color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.1, radius: raioKm * 1000
            }).addTo(this.map);
            this.radiusLayers.push(circulo);
        }

        viagem.destinos.forEach((d, i) => {
            const icon = L.divIcon({
                html: `<div class="badge bg-primary rounded-circle border border-white" style="width:24px;height:24px;line-height:20px;font-size:12px;">${i + 1}</div>`,
                className: 'marker-count-icon', iconSize: [24, 24], iconAnchor: [12, 12]
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

        if (viagem.rota && viagem.rota.geometryIda) {
            const coords = L.GeoJSON.coordsToLatLngs(viagem.rota.geometryIda.coordinates);
            const poly = L.polyline(coords, { color: 'blue', weight: 5, opacity: 0.7 }).addTo(this.map);
            this.routeLayers.push(poly);
            this.map.fitBounds(poly.getBounds().pad(0.1));
        }
    }

    desenharPendentesMap(backlog) {
        backlog.forEach(p => {
            if (p.lat && p.lon) {
                const icon = L.divIcon({
                    html: '<i class="fas fa-circle text-success" style="font-size:10px; border:1px solid white; border-radius:50%;"></i>',
                    className: 'backlog-icon', iconSize: [10, 10]
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

    // --- RENDERIZAÇÃO DE INTERFACE ---
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
                    <td>
                        <div class="fw-bold small text-truncate" style="max-width:140px;">${d.cliente}</div>
                        <div class="x-small text-muted">${d.cidade} | ${d.bairro || ''}</div>
                    </td>
                    <td class="text-end small">${d.peso}kg</td>
                    <td class="text-end">
                        <button class="btn btn-link text-danger p-0 btn-remove-order" data-trip="${idx}" data-ped="${i}"><i class="fas fa-times"></i></button>
                    </td>
                </tr>
            `).join('');

            const optionsVeiculo = frota.map(f => `<option value="${f.tipo}" ${f.tipo === v.veiculo.tipo ? 'selected' : ''}>${f.tipo}</option>`).join('');

            // BLINDAGEM CONTRA ERRO 'toFixed' DE UNDEFINED
            const distKm = v.rota && v.rota.distKm ? v.rota.distKm : 0;
            const custoDiesel = v.rota && v.rota.custoDiesel ? v.rota.custoDiesel : 0;
            const custoTotal = v.rota && v.rota.custoTotal ? v.rota.custoTotal : 0;
            const ocupacao = v.ocupacaoPct || 0;

            const pedagioEstimado = (distKm * 0.15 * v.veiculo.eixos).toFixed(2);

            container.innerHTML += `
                <div class="card mb-3 shadow-sm trip-card border-0" data-idx="${idx}">
                    <div class="card-header py-2 ${ocupacao > 100 ? 'bg-danger text-white' : 'bg-primary text-white'}">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="fw-bold"><i class="fas fa-route"></i> Rota ${idx + 1}</div>
                            <select class="form-select form-select-sm select-vehicle-change text-dark" data-trip-idx="${idx}" style="width:120px; font-size:0.8rem;">
                                ${optionsVeiculo}
                            </select>
                        </div>
                    </div>
                    <div class="card-body p-2 bg-light">
                        <div class="row g-1 text-center mb-2 small bg-white border rounded py-1 mx-0">
                            <div class="col-3 border-end">
                                <div class="text-muted x-small">Entregas</div>
                                <div class="fw-bold text-dark">${v.destinos.length}</div>
                            </div>
                            <div class="col-3 border-end">
                                <div class="text-muted x-small">Distância</div>
                                <div class="fw-bold text-dark">${distKm.toFixed(1)} km</div>
                            </div>
                            <div class="col-3 border-end">
                                <div class="text-muted x-small">Diesel</div>
                                <div class="fw-bold text-dark">R$ ${custoDiesel.toFixed(0)}</div>
                            </div>
                            <div class="col-3">
                                <div class="text-muted x-small">Total</div>
                                <div class="fw-bold text-success">R$ ${custoTotal.toFixed(0)}</div>
                            </div>
                        </div>
                        
                        <div class="d-flex justify-content-between px-2 mb-2 x-small text-muted border-top pt-1">
                            <span><i class="fas fa-weight-hanging"></i> ${v.pesoTotal}kg (${ocupacao.toFixed(0)}%)</span>
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

        document.querySelectorAll('.table-orders tbody').forEach((el, tripIdx) => {
            new Sortable(el, {
                animation: 150,
                ghostClass: 'bg-light',
                handle: '.draggable-row',
                onEnd: (evt) => {
                    document.dispatchEvent(new CustomEvent('routeOrderChanged', {
                        detail: { tripIdx: tripIdx, oldIdx: evt.oldIndex, newIdx: evt.newIndex }
                    }));
                }
            });
        });
    }

    // --- CORREÇÃO AQUI: INPUT DE ROTA MANUAL ---
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
                
                <div class="input-group input-group-sm mt-2 pt-1 border-top">
                    <span class="input-group-text bg-white border-0 small text-muted ps-0">Mover p/ Rota:</span>
                    <input type="number" class="form-control text-center rounded-start" id="manualRoute_${i}" placeholder="#" min="1" style="max-width: 60px;">
                    <button class="btn btn-outline-success btn-manual-add" data-ped-idx="${i}" title="Adicionar à Rota"><i class="fas fa-check"></i></button>
                </div>
            </div>
        `).join('');
    }

    renderizarListaLocais(l) {
        const el = document.getElementById('savedLocationsList'); if (!el) return;
        el.innerHTML = l.map(x => `<div class="list-group-item d-flex justify-content-between"><div>${x.nome}</div><div><button class="btn btn-sm btn-primary btn-confirm-origin" data-name="${x.nome}" data-lat="${x.lat}" data-lon="${x.lon}">Usar</button> <button class="btn btn-sm btn-danger btn-remove-loc" data-id="${x.id}">X</button></div></div>`).join('');
    }

    preencherConfig(c, f) {
        if (c) {
            document.getElementById('radiusInput').value = c.radiusKm || 200;
            document.getElementById('dieselPrice').value = c.dieselPrice || 6;
        }
        this.renderizarTabelaFrota(f);
    }

    renderizarTabelaFrota(f) {
        document.getElementById('fleetTableBody').innerHTML = f.map(v => `<tr><td><input type="checkbox" checked disabled></td><td>${v.tipo}</td><td><input value="${v.capKg}" disabled class="form-control form-control-sm"></td><td><input value="${v.qtd}" class="form-control form-control-sm"></td><td><input value="${v.maxStops}" class="form-control form-control-sm"></td><td><input value="${v.custoFixo}" class="form-control form-control-sm"></td><td><input value="${v.consumo}" class="form-control form-control-sm"></td><td><input value="${v.eixos}" disabled class="form-control form-control-sm"></td></tr>`).join('');
    }

    obterConfigFrota(o) {
        const trs = document.querySelectorAll('#fleetTableBody tr'); const n = [];
        trs.forEach((tr, i) => { const inp = tr.querySelectorAll('input'); const v = { ...o[i] }; v.qtd = parseInt(inp[2].value); v.maxStops = parseInt(inp[3].value); v.custoFixo = parseFloat(inp[4].value); v.consumo = parseFloat(inp[5].value); n.push(v); });
        return n;
    }

    obterConfigGlobal() {
        return { radiusKm: parseFloat(document.getElementById('radiusInput').value) || 200, dieselPrice: parseFloat(document.getElementById('dieselPrice').value) || 6, unloadTime: 45, roundtrip: document.getElementById('returnToOrigin').checked };
    }

    renderizarTabelaDados(p) {
        document.querySelector('#dataTable tbody').innerHTML = p.map(x => `<tr><td>${x.pedido}</td><td>${x.supervisor}</td><td>${x.cliente}</td><td>${x.bairro}</td><td>${x.cidade}/${x.uf}</td><td>${x.peso}</td><td>${x.agendado ? 'SIM' : ''}</td><td>${x.status}</td></tr>`).join('');
    }

    mostrarModalSelecao(l) {
        const el = document.getElementById('modalOriginList');
        el.innerHTML = l.map(x => `<button class="list-group-item btn-confirm-origin" data-name="${x.nome}" data-lat="${x.lat}" data-lon="${x.lon}">${x.nome}</button>`).join('');
        new bootstrap.Modal(document.getElementById('originModal')).show();
    }

    async solicitarFiltroStatus(s) {
        return new Promise(r => {
            document.getElementById('statusFilterList').innerHTML = s.map(x => `<div class="form-check"><input type="checkbox" class="form-check-input status-chk" value="${x}" checked> ${x}</div>`).join('');
            const m = new bootstrap.Modal(document.getElementById('statusModal'));
            document.getElementById('btnConfirmStatus').onclick = () => { r(Array.from(document.querySelectorAll('.status-chk:checked')).map(c => c.value)); m.hide(); };
            m.show();
        });
    }

    imprimirManifesto(viagem, idx) {
        const w = window.open('', '', 'width=800,height=600');

        const dist = viagem.rota ? viagem.rota.distKm.toFixed(1) : '0.0';
        const custo = viagem.rota ? viagem.rota.custoTotal.toFixed(2) : '0.00';
        const ocupacao = viagem.ocupacaoPct ? viagem.ocupacaoPct.toFixed(1) : '0';

        w.document.write(`
            <html>
            <head>
                <title>Manifesto Rota ${idx + 1}</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                    th { background-color: #f2f2f2; font-weight: bold; }
                    h2 { margin-bottom: 5px; color: #333; }
                    .header-info { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
                    .resumo { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="header-info">
                    <h2>Manifesto de Carga - Rota ${idx + 1}</h2>
                    <div class="resumo">
                        <div>
                            <strong>Veículo:</strong> ${viagem.veiculo.tipo}<br>
                            <strong>Capacidade:</strong> ${viagem.veiculo.capKg}kg
                        </div>
                        <div>
                            <strong>Peso Total:</strong> ${viagem.pesoTotal}kg (${ocupacao}%)<br>
                            <strong>Qtd. Entregas:</strong> ${viagem.destinos.length}
                        </div>
                        <div>
                            <strong>Distância Est.:</strong> ${dist} km<br>
                            <strong>Custo Est.:</strong> R$ ${custo}
                        </div>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 40px;">Seq</th>
                            <th>Pedido</th>
                            <th>Cliente</th>
                            <th>Endereço</th>
                            <th>Cidade/UF</th>
                            <th style="width: 70px;">Peso (kg)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${viagem.destinos.map((d, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${d.pedido}</td>
                                <td>${d.cliente}</td>
                                <td>${d.endereco}</td>
                                <td>${d.cidade}/${d.uf}</td>
                                <td>${d.peso}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666;">
                    <p>Gerado automaticamente por FreteFleet SaaS | Data: ${new Date().toLocaleString()}</p>
                </div>
                <script>window.print();</script>
            </body>
            </html>
        `);
        w.document.close();
    }

    setupSobre() {
        if (document.getElementById('btnOpenAbout')) {
            document.getElementById('btnOpenAbout').onclick = () => {
                this.showModal(`<h5>FreteCalc SaaS</h5><p>Versão 3.5 (Stable)</p><p>Desenvolvido para gestão logística.</p>`);
            };
        }
    }
}