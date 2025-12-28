export class FreightView {
    constructor() {
        this.map = null;
        this.previewMarkers = [];
        this.routeMarkers = [];
        this.pendingMarkers = [];
        this.routeLayers = [];
        this.originLayer = null;
        this.radiusLayers = [];
        this.dataTable = null;

        this.initMap();
    }

    initMap() {
        if (document.getElementById('map')) {
            // --- CAMADAS DE MAPA ---
            const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 });
            const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19 });
            const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google Maps' });
            const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CartoDB', maxZoom: 20 });

            // Inicializa Mapa
            this.map = L.map('map', {
                center: [-23.5505, -46.6333],
                zoom: 10,
                layers: [osm],
                zoomControl: false
            });

            L.control.zoom({ position: 'topleft' }).addTo(this.map);

            // Controle de Camadas
            const baseMaps = {
                "Padrão": osm,
                "Satélite": satellite,
                "Híbrido": googleHybrid,
                "Clean": cartoLight
            };
            L.control.layers(baseMaps).addTo(this.map);

            // Correção de Renderização
            setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 500);
        }
    }

    // --- FUNÇÕES GERAIS ---
    setLoading(ativo, htmlContent = "Carregando...") {
        const modal = document.getElementById('loadingModal');
        const backdrop = document.getElementById('loadingBackdrop');
        const txt = document.getElementById('loadingModalText');
        if (ativo) {
            if (txt) txt.innerHTML = htmlContent;
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

    // --- MAPA ---
    limparMapa() {
        this.limparRota();
        this.limparPendentes();
        this.limparPreview();
        if (this.originLayer) { this.map.removeLayer(this.originLayer); this.originLayer = null; }
    }

    limparRota() {
        this.routeMarkers.forEach(m => this.map.removeLayer(m));
        this.routeLayers.forEach(l => this.map.removeLayer(l));
        this.radiusLayers.forEach(r => this.map.removeLayer(r));
        this.routeMarkers = [];
        this.routeLayers = [];
        this.radiusLayers = [];
    }

    limparPendentes() {
        this.pendingMarkers.forEach(m => this.map.removeLayer(m));
        this.pendingMarkers = [];
    }

    limparPreview() {
        this.previewMarkers.forEach(m => this.map.removeLayer(m));
        this.previewMarkers = [];
    }

    desenharOrigem(lat, lon, nome) {
        if (!lat || !lon) return;
        const icon = L.divIcon({
            html: '<i class="fas fa-warehouse fa-2x text-danger" style="text-shadow: 2px 2px 2px white;"></i>',
            className: 'custom-div-icon', iconSize: [30, 30], iconAnchor: [15, 30]
        });
        this.originLayer = L.marker([lat, lon], { icon }).addTo(this.map).bindPopup(`<b>Origem / CD</b><br>${nome}`).openPopup();
    }

    adicionarPontoPreview(p) {
        if (p.lat && p.lon) {
            const content = `<div style="min-width: 200px; font-size: 0.85rem;"><strong>${p.cliente}</strong><br>${p.endereco}<br>${parseFloat(p.peso).toFixed(2)} kg</div>`;
            const m = L.marker([p.lat, p.lon]).addTo(this.map).bindPopup(content);
            this.previewMarkers.push(m);
        }
    }

    focarMapaNosPontos() {
        if (this.previewMarkers.length) {
            const group = new L.featureGroup(this.previewMarkers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    desenharRota(viagem, configGlobal) {
        this.limparRota();
        if (viagem.origem && !this.originLayer) this.desenharOrigem(viagem.origem.lat, viagem.origem.lon, 'Origem');
        if (!viagem || !viagem.destinos) return;

        if (viagem.destinos.length > 0) {
            const primeira = viagem.destinos[0];
            const raioKm = configGlobal ? configGlobal.radiusKm : 100;
            const circulo = L.circle([primeira.lat, primeira.lon], { color: '#0d6efd', fillColor: '#0d6efd', fillOpacity: 0.05, radius: raioKm * 1000 }).addTo(this.map);
            this.radiusLayers.push(circulo);
        }

        const pointsForBounds = [];
        if (viagem.origem) pointsForBounds.push([viagem.origem.lat, viagem.origem.lon]);

        viagem.destinos.forEach((d, i) => {
            const icon = L.divIcon({ html: `<div class="badge bg-primary rounded-circle border border-white shadow-sm" style="width:24px;height:24px;line-height:20px;font-size:12px;">${i + 1}</div>`, className: 'marker-count-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
            const content = `<div style="min-width: 200px; font-size: 0.85rem; line-height: 1.5;"><div class="border-bottom pb-1 mb-1 fw-bold text-primary">Entrega #${i + 1}</div><strong>N° Pedido:</strong> ${d.pedido}<br><strong>Cliente:</strong> ${d.cliente}<br><strong>Bairro:</strong> ${d.bairro || '--'}<br><strong>Peso:</strong> ${parseFloat(d.peso).toFixed(2)} kg</div>`;
            const m = L.marker([d.lat, d.lon], { icon }).addTo(this.map).bindPopup(content);
            this.routeMarkers.push(m);
            pointsForBounds.push([d.lat, d.lon]);
        });

        let polyBounds = null;
        if (viagem.rota && viagem.rota.geometryIda) {
            const coords = L.GeoJSON.coordsToLatLngs(viagem.rota.geometryIda.coordinates);
            const poly = L.polyline(coords, { color: '#0d6efd', weight: 5, opacity: 0.7 }).addTo(this.map);
            this.routeLayers.push(poly);
            polyBounds = poly.getBounds();
        }

        if (polyBounds) this.map.fitBounds(polyBounds.pad(0.1));
        else if (pointsForBounds.length > 0) this.map.fitBounds(L.latLngBounds(pointsForBounds).pad(0.1));
    }

    desenharPendentesMap(backlog) {
        this.limparPendentes();
        backlog.forEach(p => {
            if (p.lat && p.lon) {
                const icon = L.divIcon({ html: '<i class="fas fa-circle text-success shadow-sm" style="font-size:12px; border:2px solid white; border-radius:50%;"></i>', className: 'backlog-icon', iconSize: [12, 12] });
                const content = `<div style="min-width: 200px; font-size: 0.85rem; line-height: 1.5;"><div class="border-bottom pb-1 mb-1 fw-bold text-success">Pendente</div><strong>${p.cliente}</strong><br>${p.bairro || ''} - ${p.cidade}<br><span class="text-danger small">${p.motivo}</span></div>`;
                const m = L.marker([p.lat, p.lon], { icon }).addTo(this.map).bindPopup(content);
                this.pendingMarkers.push(m);
            }
        });
    }

    // --- CORREÇÃO DE CORES DA ROTA (AMARELO/VERDE/VERMELHO/AZUL) ---
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
                        <div class="x-small text-muted" style="font-size: 0.75rem;">${d.supervisor || ''}</div>
                        <div class="x-small text-muted">${d.bairro || 'Bairro N/A'} - ${d.cidade}</div>
                    </td>
                    <td class="text-end small">${parseFloat(d.peso).toFixed(2)}kg</td>
                    <td class="text-end">
                        <button class="btn btn-link text-danger p-0 btn-remove-order" data-trip="${idx}" data-ped="${i}"><i class="fas fa-times"></i></button>
                    </td>
                </tr>
            `).join('');

            const optionsVeiculo = frota.map(f => `<option value="${f.tipo}" ${f.tipo === v.veiculo.tipo ? 'selected' : ''}>${f.tipo}</option>`).join('');
            const distKm = v.rota && v.rota.distKm ? v.rota.distKm : 0;
            const custoDiesel = v.rota && v.rota.custoDiesel ? v.rota.custoDiesel : 0;
            const custoTotal = v.rota && v.rota.custoTotal ? v.rota.custoTotal : 0;
            const ocupacao = v.ocupacaoPct || 0;
            const pedagioEstimado = (distKm * 0.15 * v.veiculo.eixos).toFixed(2);

            // --- LÓGICA DE CORES DO CABEÇALHO ---
            let headerClass = 'bg-primary text-white'; // Azul (Padrão/Paletizada)

            // Verifica se é paletizada (Lógica simples: se tiver um campo 'paletizada' ou pelo tipo)
            // Aqui vamos assumir que azul é o padrão, e mudamos conforme a ocupação.

            if (ocupacao > 100) {
                headerClass = 'bg-danger text-white'; // Vermelho (Estourou)
            } else if (ocupacao >= 99) {
                headerClass = 'bg-success text-white'; // Verde (Cheio)
            } else if (ocupacao < 100) {
                headerClass = 'bg-warning text-dark'; // Amarelo (Incompleto)
            }

            // Se quiser priorizar carga paletizada como AZUL independentemente da ocupação:
            // if (v.isPaletizada) headerClass = 'bg-primary text-white'; 

            container.innerHTML += `
                <div class="card mb-3 shadow-sm trip-card border-0" data-idx="${idx}">
                    <div class="card-header py-2 ${headerClass}">
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
                            <span><i class="fas fa-weight-hanging"></i> ${v.pesoTotal.toFixed(2)}kg (${ocupacao.toFixed(0)}%)</span>
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
            new Sortable(el, { animation: 150, ghostClass: 'bg-light', handle: '.draggable-row', onEnd: (evt) => { document.dispatchEvent(new CustomEvent('routeOrderChanged', { detail: { tripIdx: tripIdx, oldIdx: evt.oldIndex, newIdx: evt.newIndex } })); } });
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
                    <span class="badge bg-light text-dark border">${parseFloat(p.peso).toFixed(2)}kg</span>
                </div>
                <div class="small text-muted text-truncate fw-bold">${p.cliente}</div>
                <div class="d-flex justify-content-between x-small text-muted mt-1">
                    <span><i class="fas fa-user-tie"></i> ${p.supervisor || '--'}</span>
                    <span>${p.bairro || '--'}</span>
                </div>
                <div class="x-small text-muted mb-1">${p.cidade}/${p.uf}</div>
                <div class="x-small text-danger border-top pt-1 mt-1">Motivo: ${p.motivo}</div>
                <div class="input-group input-group-sm mt-2 pt-1 border-top">
                    <span class="input-group-text bg-white border-0 small text-muted ps-0">Mover p/ Rota:</span>
                    <input type="number" class="form-control text-center rounded-start" id="manualRoute_${i}" placeholder="#" min="1" style="max-width: 60px;">
                    <button class="btn btn-outline-success btn-manual-add" data-ped-idx="${i}" title="Adicionar"><i class="fas fa-check"></i></button>
                </div>
            </div>
        `).join('');
    }

    renderizarListaLocais(l, isAdmin = false) {
        const el = document.getElementById('savedLocationsList'); if (!el) return;
        el.innerHTML = l.map(x => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div><strong>${x.nome}</strong><br><small class="text-muted">${x.lat.toFixed(4)}, ${x.lon.toFixed(4)}</small></div>
                <div class="d-flex gap-1">
                    <button class="btn btn-outline-primary btn-sm btn-confirm-origin" data-name="${x.nome}" data-lat="${x.lat}" data-lon="${x.lon}">Usar</button>
                    ${isAdmin ? `<button class="btn btn-outline-danger btn-sm btn-remove-loc" data-id="${x.id}">X</button>` : ''}
                </div>
            </div>`).join('');
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
        if (this.dataTable) {
            this.dataTable.destroy();
        }

        const tbody = document.querySelector('#dataTable tbody');
        tbody.innerHTML = p.map(x => `
            <tr>
                <td>${x.pedido}</td>
                <td>${x.supervisor}</td>
                <td>${x.cliente}</td>
                <td>${x.bairro}</td>
                <td>${x.cidade}/${x.uf}</td>
                <td>${parseFloat(x.peso).toFixed(2)}</td>
                <td>${x.agendado ? 'SIM' : ''}</td>
                <td>${x.status}</td>
            </tr>
        `).join('');

        setTimeout(() => {
            this.dataTable = $('#dataTable').DataTable({
                "pageLength": 10,
                "lengthChange": false,
                "language": {
                    "url": "//cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json"
                },
                "order": []
            });
        }, 0);
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
        w.document.write(`<html><head><title>Manifesto Rota ${idx + 1}</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px;}th{background-color:#f2f2f2;}h2{margin-bottom:5px;}.header-info{margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:10px;}.resumo{display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;}</style></head><body><div class="header-info"><h2>Manifesto de Carga - Rota ${idx + 1}</h2><div class="resumo"><div><strong>Veículo:</strong> ${viagem.veiculo.tipo}<br><strong>Capacidade:</strong> ${viagem.veiculo.capKg}kg</div><div><strong>Peso Total:</strong> ${viagem.pesoTotal.toFixed(2)}kg (${ocupacao}%)<br><strong>Qtd. Entregas:</strong> ${viagem.destinos.length}</div><div><strong>Distância Est.:</strong> ${dist} km<br><strong>Custo Est.:</strong> R$ ${custo}</div></div></div><table><thead><tr><th style="width: 40px;">Seq</th><th>Pedido</th><th>Cliente</th><th>Supervisor</th><th>Endereço</th><th>Cidade/UF</th><th style="width: 70px;">Peso (kg)</th></tr></thead><tbody>${viagem.destinos.map((d, i) => `<tr><td>${i + 1}</td><td>${d.pedido}</td><td>${d.cliente}</td><td>${d.supervisor || ''}</td><td>${d.endereco}</td><td>${d.cidade}/${d.uf}</td><td>${parseFloat(d.peso).toFixed(2)}</td></tr>`).join('')}</tbody></table><div style="margin-top:30px;text-align:center;font-size:10px;color:#666;"><p>Gerado automaticamente por FreteFleet SaaS | Data: ${new Date().toLocaleString()}</p></div><script>window.print();</script></body></html>`);
        w.document.close();
    }
    setupSobre() { if (document.getElementById('btnOpenAbout')) { document.getElementById('btnOpenAbout').onclick = () => { this.showModal(`<h5>FreteCalc SaaS</h5><p>Versão 3.5 (Stable)</p><p>Desenvolvido para gestão logística.</p>`); }; } }
}