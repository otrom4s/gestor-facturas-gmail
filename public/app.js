let activeTab = 'invoices';
let currentInvoices = [];
let connectedAccounts = [];
let progressPollInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkUrlParams();
  loadAccounts();
  loadInvoices();
  loadAlerts();
  loadStats();
  checkInitialProgress();
  lucide.createIcons();
});

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const connected = urlParams.get('connected');
  const error = urlParams.get('error');

  if (connected) {
    showToast(`✅ Cuenta de Gmail (${connected}) conectada exitosamente.`, 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (error) {
    showToast(`❌ Error conectando cuenta: ${error}`, 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toastNotification');
  toast.className = `p-4 rounded-xl border flex items-center justify-between transition-all ${
    type === 'success' 
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
      : type === 'error'
      ? 'bg-rose-50 border-rose-200 text-rose-800'
      : 'bg-blue-50 border-blue-200 text-blue-800'
  }`;
  toast.innerHTML = `
    <span>${message}</span>
    <button onclick="document.getElementById('toastNotification').classList.add('hidden')" class="ml-4 font-bold text-lg leading-none">&times;</button>
  `;
  toast.classList.remove('hidden');
}

// Progress Bar Manager
function startProgressPolling() {
  if (progressPollInterval) clearInterval(progressPollInterval);

  const card = document.getElementById('progressCard');
  card.classList.remove('hidden');

  progressPollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/progress');
      const data = await res.json();

      if (data.active) {
        card.classList.remove('hidden');
        document.getElementById('progressTitle').textContent = data.title || 'Procesando...';
        document.getElementById('progressStep').textContent = data.step || 'En progreso...';
        document.getElementById('progressPercent').textContent = `${data.percent || 0}%`;
        document.getElementById('progressBarFill').style.width = `${data.percent || 0}%`;
      } else {
        clearInterval(progressPollInterval);
        progressPollInterval = null;

        document.getElementById('progressPercent').textContent = '100%';
        document.getElementById('progressBarFill').style.width = '100%';
        document.getElementById('progressStep').textContent = data.step || '¡Listo!';

        setTimeout(() => {
          card.classList.add('hidden');
          loadInvoices();
          loadStats();
          loadAccounts();
          loadAlerts();
        }, 1200);
      }
    } catch (e) {
      console.error('Error polling progress:', e);
    }
  }, 600);
}

async function checkInitialProgress() {
  try {
    const res = await fetch('/api/progress');
    const data = await res.json();
    if (data.active) {
      startProgressPolling();
    }
  } catch (e) {}
}

function switchTab(tab) {
  activeTab = tab;
  const tabs = ['invoices', 'alerts', 'accounts'];
  
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${capitalize(t)}`);
    const content = document.getElementById(`tabContent${capitalize(t)}`);
    if (t === tab) {
      btn.className = 'py-3 px-1 border-b-2 font-semibold text-sm flex items-center space-x-2 border-emerald-600 text-emerald-600 transition';
      content.classList.remove('hidden');
    } else {
      btn.className = 'py-3 px-1 border-b-2 font-semibold text-sm flex items-center space-x-2 border-transparent text-slate-500 hover:text-slate-700 transition';
      content.classList.add('hidden');
    }
  });

  const filtersRow = document.getElementById('filtersRow');
  const exportBar = document.getElementById('exportBar');
  if (tab === 'invoices') {
    filtersRow.classList.remove('hidden');
    exportBar.classList.remove('hidden');
  } else {
    filtersRow.classList.add('hidden');
    exportBar.classList.add('hidden');
  }

  lucide.createIcons();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Load Accounts
async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts');
    connectedAccounts = await res.json();

    document.getElementById('tabBadgeAccounts').textContent = connectedAccounts.length;

    // Populate user profile widget in header with active account
    const profileWidget = document.getElementById('userProfileWidget');
    if (connectedAccounts.length > 0) {
      const active = connectedAccounts[0];
      const avatar = document.getElementById('userAvatar');
      const name = document.getElementById('userName');
      const email = document.getElementById('userEmail');

      const fallbackUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(active.name || active.email) + '&background=10b981&color=fff&bold=true';
      avatar.onerror = () => { avatar.src = fallbackUrl; };
      avatar.src = active.picture || fallbackUrl;

      name.textContent = active.name || active.email.split('@')[0];
      email.textContent = active.email;
      profileWidget.classList.remove('hidden');
    } else {
      profileWidget.classList.add('hidden');
    }

    // Populate filter dropdown
    const select = document.getElementById('filterAccount');
    select.innerHTML = '<option value="">Todas las cuentas</option>' + 
      connectedAccounts.map(a => `<option value="${a.id}">${a.email}</option>`).join('');

    // Render accounts tab list
    const list = document.getElementById('accountsList');
    if (connectedAccounts.length === 0) {
      list.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          <i data-lucide="mail-warning" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i>
          <p class="font-medium text-slate-600">Aún no has conectado ninguna cuenta</p>
          <p class="text-xs text-slate-400 mt-1">Haz clic en "+ Conectar Cuenta" para autorizar tu buzón o el de un cliente.</p>
        </div>
      `;
    } else {
      list.innerHTML = connectedAccounts.map(a => {
        const fallbackUrl = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(a.name || a.email) + '&background=10b981&color=fff&bold=true';
        return `
          <div class="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-sm">
            <div class="flex items-center space-x-3">
              <img src="${a.picture || fallbackUrl}" 
                   referrerpolicy="no-referrer"
                   onerror="this.src='${fallbackUrl}'"
                   class="w-10 h-10 rounded-full border border-slate-200 object-cover bg-slate-100">
              <div>
                <h4 class="font-bold text-slate-900 text-sm">${escapeHtml(a.name || a.email)} <span class="text-xs text-slate-400 font-normal">(${escapeHtml(a.email)})</span></h4>
                <p class="text-xs text-slate-400">
                  Última sincr: ${a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : 'Nunca'} • 
                  ${a.invoice_count} facturas • ${a.alert_count} alertas
                </p>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <button onclick="syncSingleAccount(${a.id})" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition flex items-center space-x-1">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                <span>Sincronizar</span>
              </button>
              <button onclick="deleteAccount(${a.id})" class="p-1.5 text-slate-400 hover:text-rose-600 transition" title="Desconectar">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading accounts:', err);
  }
}

// Load Invoices
async function loadInvoices() {
  const search = document.getElementById('filterSearch').value;
  const type = document.getElementById('filterType').value;
  const quarter = document.getElementById('filterQuarter').value;
  const year = document.getElementById('filterYear').value;
  const accountId = document.getElementById('filterAccount').value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (type) params.append('type', type);
  if (quarter) params.append('quarter', quarter);
  if (year) params.append('year', year);
  if (accountId) params.append('account_id', accountId);

  try {
    const res = await fetch(`/api/invoices?${params.toString()}`);
    currentInvoices = await res.json();

    document.getElementById('filteredCount').textContent = currentInvoices.length;
    document.getElementById('tabBadgeInvoices').textContent = currentInvoices.length;

    const tbody = document.getElementById('invoicesTableBody');
    const empty = document.getElementById('invoicesEmptyState');

    if (currentInvoices.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      tbody.innerHTML = currentInvoices.map(inv => {
        const isIngreso = inv.invoice_type === 'ingreso';
        const typeButton = isIngreso
          ? `<button onclick="toggleInvoiceType(${inv.id})" title="Factura de Ingreso. Haz clic para cambiar a Gasto" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition shadow-xs">
               <i data-lucide="arrow-up-right" class="w-3.5 h-3.5 mr-1 text-emerald-600"></i>Ingreso
             </button>`
          : `<button onclick="toggleInvoiceType(${inv.id})" title="Factura de Gasto. Haz clic para cambiar a Ingreso" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 transition shadow-xs">
               <i data-lucide="arrow-down-right" class="w-3.5 h-3.5 mr-1 text-rose-600"></i>Gasto
             </button>`;

        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="py-3 px-4">${typeButton}</td>
            <td class="py-3 px-4 font-mono text-xs text-slate-600">${inv.invoice_date || '-'}</td>
            <td class="py-3 px-4 font-semibold text-slate-900">${escapeHtml(inv.supplier_name || 'Desconocido')}</td>
            <td class="py-3 px-4 font-mono text-xs text-slate-500">${escapeHtml(inv.supplier_vat_id || '-')}</td>
            <td class="py-3 px-4 font-mono text-xs text-slate-700">${escapeHtml(inv.invoice_number || '-')}</td>
            <td class="py-3 px-4 text-right font-medium text-slate-700">${formatCurrency(inv.base_amount)}</td>
            <td class="py-3 px-4 text-right text-slate-500">${inv.tax_rate ? inv.tax_rate + '%' : '-'}</td>
            <td class="py-3 px-4 text-right text-slate-700">${formatCurrency(inv.tax_amount)}</td>
            <td class="py-3 px-4 text-right font-bold ${isIngreso ? 'text-emerald-700' : 'text-slate-900'}">${formatCurrency(inv.total_amount)}</td>
            <td class="py-3 px-4 text-center">
              <div class="flex items-center justify-center space-x-1.5">
                <a href="/api/invoices/${inv.id}/download" download title="Descargar PDF original" class="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition">
                  <i data-lucide="download" class="w-4 h-4"></i>
                </a>
                <button onclick="viewDetails(${inv.id})" title="Ver detalles y JSON de IA" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
                  <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteInvoice(${inv.id})" title="Eliminar factura o documento" class="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
    lucide.createIcons();
    loadStats();
  } catch (err) {
    console.error('Error loading invoices:', err);
  }
}

// Toggle Invoice Type
async function toggleInvoiceType(id) {
  try {
    const res = await fetch(`/api/invoices/${id}/toggle-type`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      showToast(`Documento reclasificado como ${data.newType === 'ingreso' ? '↗️ Ingreso' : '↘️ Gasto'}`, 'info');
      loadInvoices();
      loadStats();
    }
  } catch (e) {
    console.error('Error toggling invoice type:', e);
  }
}

// Delete single invoice
async function deleteInvoice(id) {
  if (!confirm('¿Eliminar este documento de la lista contable?')) return;
  try {
    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Documento eliminado', 'info');
      loadInvoices();
      loadStats();
    }
  } catch (e) {
    console.error('Error deleting invoice:', e);
  }
}

// Load Alerts
async function loadAlerts() {
  try {
    const res = await fetch('/api/alerts?status=pending');
    const alerts = await res.json();

    document.getElementById('statAlerts').textContent = alerts.length;
    document.getElementById('tabBadgeAlerts').textContent = alerts.length;

    const list = document.getElementById('alertsList');
    const empty = document.getElementById('alertsEmptyState');

    if (alerts.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = alerts.map(al => `
        <div class="p-4 bg-white border border-amber-200/80 rounded-xl shadow-sm hover:border-amber-300 transition space-y-2">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 text-xs font-bold rounded-md bg-amber-100 text-amber-800">Factura en Portal</span>
                <span class="text-xs text-slate-400">${al.email_date ? new Date(al.email_date).toLocaleDateString() : ''}</span>
                <span class="text-xs text-slate-400">• Buzón: ${al.account_email}</span>
              </div>
              <h4 class="font-bold text-slate-900 text-sm mt-1">${escapeHtml(al.email_subject || 'Sin asunto')}</h4>
              <p class="text-xs text-slate-600 font-medium">De: ${escapeHtml(al.sender || '')}</p>
            </div>
            
            <div class="flex items-center space-x-2 flex-shrink-0">
              <a href="${al.portal_url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm">
                <span>Acceder al Portal</span>
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </a>
              <button onclick="resolveAlert(${al.id})" title="Marcar como atendida" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
                Hecho
              </button>
            </div>
          </div>

          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-600">
            <span class="font-semibold text-slate-800">Texto del botón/enlace detectado:</span> "${escapeHtml(al.link_text)}"
            ${al.contextSnippet ? `<p class="mt-1 text-slate-500 italic">"${escapeHtml(al.contextSnippet)}..."</p>` : ''}
          </div>
        </div>
      `).join('');
    }
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading alerts:', err);
  }
}

// Load Stats
async function loadStats() {
  const search = document.getElementById('filterSearch').value;
  const type = document.getElementById('filterType').value;
  const quarter = document.getElementById('filterQuarter').value;
  const year = document.getElementById('filterYear').value;
  const accountId = document.getElementById('filterAccount').value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (type) params.append('type', type);
  if (quarter) params.append('quarter', quarter);
  if (year) params.append('year', year);
  if (accountId) params.append('account_id', accountId);

  try {
    const res = await fetch(`/api/invoices/stats?${params.toString()}`);
    const data = await res.json();
    const t = data.totals || {};

    document.getElementById('statGastos').textContent = formatCurrency(t.total_gastos || 0);
    document.getElementById('statBaseGastos').textContent = formatCurrency(t.base_gastos || 0);
    document.getElementById('statIngresos').textContent = formatCurrency(t.total_ingresos || 0);
    document.getElementById('statBaseIngresos').textContent = formatCurrency(t.base_ingresos || 0);
    document.getElementById('statIvaSoportado').textContent = formatCurrency(t.iva_soportado || 0);
    document.getElementById('statIvaRepercutido').textContent = formatCurrency(t.iva_repercutido || 0);
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// Reanalyze all invoices with Gemini AI
async function reanalyzeWithAI() {
  showToast('Iniciando análisis inteligente con Gemini Flash...', 'info');
  startProgressPolling();

  try {
    await fetch('/api/invoices/reanalyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceAll: true })
    });
  } catch (err) {
    showToast(`Error al iniciar análisis: ${err.message}`, 'error');
  }
}

// Sync actions
async function syncActiveAccount() {
  if (connectedAccounts.length === 0) {
    showToast('⚠️ No hay cuentas conectadas. Pulsa "+ Conectar Cuenta" primero.', 'error');
    return;
  }
  const accountId = document.getElementById('filterAccount').value || connectedAccounts[0].id;
  await syncSingleAccount(accountId);
}

async function syncSingleAccount(accountId) {
  const icon = document.getElementById('syncIcon');
  if (icon) icon.classList.add('animate-spin');

  startProgressPolling();

  try {
    const res = await fetch(`/api/accounts/${accountId}/sync`, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast(`🎉 ¡Sincronización finalizada!`, 'success');
    } else {
      showToast(`❌ Error al sincronizar: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`❌ Error de conexión: ${err.message}`, 'error');
  } finally {
    if (icon) icon.classList.remove('animate-spin');
  }
}

// Resolve Alert
async function resolveAlert(id) {
  try {
    await fetch(`/api/alerts/${id}/resolve`, { method: 'PATCH' });
    loadAlerts();
    showToast('Alerta marcada como resuelta', 'success');
  } catch (err) {
    console.error(err);
  }
}

// Delete Account
async function deleteAccount(id) {
  if (!confirm('¿Seguro que deseas desconectar esta cuenta?')) return;
  try {
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    loadAccounts();
    loadInvoices();
    loadAlerts();
    showToast('Cuenta desconectada', 'info');
  } catch (err) {
    console.error(err);
  }
}

// Export ZIP
function exportZip() {
  const quarter = document.getElementById('filterQuarter').value;
  const year = document.getElementById('filterYear').value;
  const accountId = document.getElementById('filterAccount').value;
  const type = document.getElementById('filterType').value;

  const params = new URLSearchParams();
  if (quarter) params.append('quarter', quarter);
  if (year) params.append('year', year);
  if (accountId) params.append('account_id', accountId);
  if (type) params.append('type', type);

  window.location.href = `/api/invoices/export/zip?${params.toString()}`;
}

// Export CSV
function exportCsv() {
  const quarter = document.getElementById('filterQuarter').value;
  const year = document.getElementById('filterYear').value;
  const accountId = document.getElementById('filterAccount').value;
  const type = document.getElementById('filterType').value;

  const params = new URLSearchParams();
  if (quarter) params.append('quarter', quarter);
  if (year) params.append('year', year);
  if (accountId) params.append('account_id', accountId);
  if (type) params.append('type', type);

  window.location.href = `/api/invoices/export/csv?${params.toString()}`;
}

// Details Modal
function viewDetails(id) {
  const inv = currentInvoices.find(x => x.id === id);
  if (!inv) return;

  const isIngreso = inv.invoice_type === 'ingreso';

  document.getElementById('modalTitle').textContent = `Factura: ${inv.supplier_name || 'Sin proveedor'}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
      <div>
        <span class="text-xs text-slate-400">Tipo de Documento:</span> 
        <p class="font-bold ${isIngreso ? 'text-emerald-600' : 'text-rose-600'}">
          ${isIngreso ? '↗️ Ingreso (Factura Emitida/Cobro)' : '↘️ Gasto (Factura Proveedor/Compra)'}
        </p>
      </div>
      <div><span class="text-xs text-slate-400">Nº Factura:</span> <p class="font-bold">${inv.invoice_number || '-'}</p></div>
      <div><span class="text-xs text-slate-400">Fecha:</span> <p class="font-bold">${inv.invoice_date || '-'}</p></div>
      <div><span class="text-xs text-slate-400">CIF / NIF:</span> <p class="font-bold">${inv.supplier_vat_id || '-'}</p></div>
      <div><span class="text-xs text-slate-400">Base Imponible:</span> <p class="font-bold text-slate-700">${formatCurrency(inv.base_amount)}</p></div>
      <div><span class="text-xs text-slate-400">IVA (${inv.tax_rate || 0}%):</span> <p class="font-bold text-slate-700">${formatCurrency(inv.tax_amount)}</p></div>
      <div><span class="text-xs text-slate-400">Total:</span> <p class="font-bold text-lg text-slate-900">${formatCurrency(inv.total_amount)}</p></div>
      <div><span class="text-xs text-slate-400">Confianza IA:</span> <p class="font-bold text-purple-600">${Math.round((inv.confidence_score || 0) * 100)}%</p></div>
    </div>
    <div class="text-xs text-slate-500 space-y-1">
      <p><strong>Correo:</strong> ${escapeHtml(inv.email_subject || '')}</p>
      <p><strong>Remitente:</strong> ${escapeHtml(inv.sender || '')}</p>
      <p><strong>Archivo:</strong> ${escapeHtml(inv.filename)} (${Math.round((inv.filesize || 0) / 1024)} KB)</p>
    </div>
    <div>
      <span class="text-xs font-semibold text-slate-400 uppercase">Extracción IA (JSON):</span>
      <pre class="mt-1 p-3 bg-slate-900 text-emerald-400 rounded-lg text-xs overflow-x-auto font-mono">${escapeHtml(inv.raw_ai_json || '{}')}</pre>
    </div>
  `;

  document.getElementById('invoiceDetailModal').classList.remove('hidden');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('invoiceDetailModal').classList.add('hidden');
}

function formatCurrency(val) {
  return (val || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
