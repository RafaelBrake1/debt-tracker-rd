import './style.css';
import confetti from 'canvas-confetti';
import { INITIAL_DEBTS, INITIAL_SETTINGS } from './debtsData.js';
import { calculateSummary, simulateRepayment, calculateCurrentMonthDistribution, formatCurrency } from './financeEngine.js';
import {
  supabase,
  syncFetchDebts,
  syncSaveDebt,
  syncDeleteDebt,
  syncFetchSettings,
  syncSaveSettings,
  syncFetchMonthlyChecks,
  syncToggleMonthlyCheck,
  syncClearMonthlyChecks,
  syncSeedDebts
} from './supabaseService.js';

// Storage keys (v2 fallback)
const STORAGE_DEBTS_KEY = 'deudazero_rd_debts_v2';
const STORAGE_SETTINGS_KEY = 'deudazero_rd_settings_v2';
const STORAGE_PAID_DUE_KEY = 'deudazero_rd_paid_due_dates_v2';

// State
let debts = loadDebts();
let settings = loadSettings();
let paidDueDates = loadPaidDueDates();
let isCloudSynced = false;
let currentFilter = 'all';
let currentTab = 'debts-tab';
let editingDebtId = null;

function loadPaidDueDates() {
  const saved = localStorage.getItem(STORAGE_PAID_DUE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Error parsing stored paid due dates', e);
    }
  }
  return [];
}

function savePaidDueDates() {
  localStorage.setItem(STORAGE_PAID_DUE_KEY, JSON.stringify(paidDueDates));
}

function loadDebts() {
  const saved = localStorage.getItem(STORAGE_DEBTS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Error parsing stored debts', e);
    }
  }
  return [...INITIAL_DEBTS];
}

function saveDebts() {
  localStorage.setItem(STORAGE_DEBTS_KEY, JSON.stringify(debts));
}

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Error parsing stored settings', e);
    }
  }
  return { ...INITIAL_SETTINGS };
}

function saveSettings() {
  localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  syncSaveSettings(settings);
}

// Format simulation month with Dominican calendar dates
function getSimulationMonthLabel(monthOffset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + (monthOffset - 1));
  const mName = d.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  const cap = mName.charAt(0).toUpperCase() + mName.slice(1);
  return `Mes ${monthOffset} (${cap})`;
}


// Show Toast helper
function showToast(message, icon = 'fa-check-circle') {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Render Main App Structure
function renderApp() {
  const app = document.getElementById('app');
  const summary = calculateSummary(debts, settings);

  app.innerHTML = `
    <!-- Header -->
    <header class="app-header">
      <div class="header-container">
        <div class="brand-wrapper">
          <div class="brand-logo-icon">
            <i class="fa-solid fa-shield-halved"></i>
          </div>
          <div>
            <div class="brand-title">
              DeudaZero <span class="badge-country">RD 🇩🇴</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500; display:flex; align-items:center; gap:0.4rem;">
              <span>Estrategia Inteligente & Control Total</span>
              <span id="cloud-sync-badge" style="font-size: 0.65rem; background: ${isCloudSynced ? 'rgba(16,185,129,0.2)' : 'rgba(6,182,212,0.2)'}; color: ${isCloudSynced ? '#34d399' : '#38bdf8'}; padding: 0.05rem 0.4rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.25rem;">
                <i class="fa-solid ${isCloudSynced ? 'fa-cloud' : 'fa-arrows-rotate fa-spin'}"></i>
                ${isCloudSynced ? 'Nube Supabase' : 'Sincronizando...'}
              </span>
            </div>
          </div>
        </div>

        <div class="header-actions">
          <div class="fx-chip" title="Tasa de cambio DOP por 1 USD">
            <i class="fa-solid fa-dollar-sign" style="color: var(--accent-emerald);"></i>
            <span>1 USD = RD$</span>
            <input type="number" id="usd-rate-input" value="${settings.usdToDopRate}" step="0.1" min="1" />
          </div>

          <button id="btn-add-debt" class="btn btn-primary">
            <i class="fa-solid fa-plus"></i> Nueva Deuda
          </button>

          <button id="btn-save-as-base" class="btn btn-secondary" title="Exportar o guardar los datos actuales como los datos base permanentes" style="font-size:0.8rem; border-color: rgba(6,182,212,0.4); color: #67e8f9;">
            <i class="fa-solid fa-floppy-disk"></i> Guardar como Base
          </button>

          <button id="btn-reset-data" class="btn btn-secondary" title="Restaurar datos originales a valores iniciales" style="font-size:0.8rem; border-color: rgba(244,63,94,0.3); color: #fca5a5;">
            <i class="fa-solid fa-rotate-right"></i> Restaurar Valores
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Hero Financial Overview Banner -->
      <section class="hero-overview">
        <div class="hero-profile">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
              <span style="font-size:0.75rem; background:rgba(6,182,212,0.15); color:var(--accent-cyan); padding:0.2rem 0.6rem; border-radius:12px; font-weight:700;">
                PANEL FINANCIERO PERSONAL
              </span>
              <span style="font-size:0.75rem; color:var(--text-muted);">Actualizado Octubre 2026</span>
            </div>
            <h1>Plan de Liquidación Acelerada</h1>
            <p>Monitoreo unificado de tarjetas de crédito y préstamos con calendario de pagos y simulación de amortización.</p>
          </div>

          <div class="income-pill-box">
            <div class="income-pill-label">Tu Ingreso Mensual Registrado</div>
            <div class="income-pill-value-row">
              <span class="income-amount">${formatCurrency(settings.monthlyIncomeDOP, 'DOP')}</span>
              <button class="income-edit-btn" id="btn-edit-income">
                <i class="fa-solid fa-pen-to-square"></i> Cambiar
              </button>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">
              Presupuesto base para pagos mínimos, gastos y aceleración de capital.
            </div>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div class="metrics-grid">
          <div class="metric-card danger">
            <div class="metric-header">
              <span>Deuda Total (RD$ Eq.)</span>
              <i class="fa-solid fa-receipt metric-icon"></i>
            </div>
            <div class="metric-val">${formatCurrency(summary.totalDebtDOP, 'DOP')}</div>
            <div class="metric-sub">${summary.activeDebtsCount} deudas activas (${summary.paidDebtsCount} saldadas)</div>
          </div>

          <div class="metric-card warning">
            <div class="metric-header">
              <span>Pagos Mínimos / Mes</span>
              <i class="fa-solid fa-calendar-check metric-icon"></i>
            </div>
            <div class="metric-val">${formatCurrency(summary.totalMinPaymentDOP, 'DOP')}</div>
            <div class="metric-sub">Representa el ${(summary.debtToIncomeRatio).toFixed(1)}% de tu ingreso</div>
          </div>

          <div class="metric-card info">
            <div class="metric-header">
              <span>Tasa Más Alta</span>
              <i class="fa-solid fa-arrow-trend-up metric-icon"></i>
            </div>
            <div class="metric-val" style="color: var(--accent-rose);">${summary.highestInterest}% Anual</div>
            <div class="metric-sub">Tarjetas de crédito (60% regular)</div>
          </div>

          <div class="metric-card success">
            <div class="metric-header">
              <span>Flujo Disponible</span>
              <i class="fa-solid fa-wallet metric-icon"></i>
            </div>
            <div class="metric-val" style="color: var(--accent-emerald);">
              ${formatCurrency(summary.remainingCashflow > 0 ? summary.remainingCashflow : 0, 'DOP')}
            </div>
            <div class="metric-sub">Tras mínimos (${formatCurrency(settings.extraMonthlyPaymentDOP, 'DOP')} para abono extra)</div>
          </div>
        </div>
      </section>

      <!-- Navigation Tabs -->
      <nav class="tabs-nav">
        <button class="tab-btn ${currentTab === 'debts-tab' ? 'active' : ''}" data-tab="debts-tab">
          <i class="fa-solid fa-credit-card"></i> Mis Deudas
          <span class="tab-badge">${debts.filter(d => d.status !== 'paid').length}</span>
        </button>
        <button class="tab-btn ${currentTab === 'strategy-tab' ? 'active' : ''}" data-tab="strategy-tab">
          <i class="fa-solid fa-bolt"></i> Estrategia y Simulador
          <span class="tab-badge">Avalancha</span>
        </button>
        <button class="tab-btn ${currentTab === 'calendar-tab' ? 'active' : ''}" data-tab="calendar-tab">
          <i class="fa-solid fa-calendar-days"></i> Calendario y Quincenas
        </button>
        <button class="tab-btn ${currentTab === 'tips-tab' ? 'active' : ''}" data-tab="tips-tab">
          <i class="fa-solid fa-lightbulb"></i> Recomendaciones RD
        </button>
      </nav>

      <!-- TAB 1: DEBTS LIST & TRACKER -->
      <div id="debts-tab" class="tab-content ${currentTab === 'debts-tab' ? 'active' : ''}">
        <div class="filter-controls-bar">
          <div class="filter-group">
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight:600;">Filtrar por:</span>
            <button class="filter-chip ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">Todas (${debts.length})</button>
            <button class="filter-chip ${currentFilter === 'credit_card' ? 'active' : ''}" data-filter="credit_card">Tarjetas de Crédito</button>
            <button class="filter-chip ${currentFilter === 'loan' ? 'active' : ''}" data-filter="loan">Préstamos</button>
            <button class="filter-chip ${currentFilter === 'overlimit' ? 'active' : ''}" data-filter="overlimit">Sobregiradas</button>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items:center; gap: 0.75rem;">
            <span><i class="fa-solid fa-circle" style="color:var(--accent-rose); font-size:0.6rem;"></i> Prioridad Alta</span>
            <span><i class="fa-solid fa-circle" style="color:var(--accent-amber); font-size:0.6rem;"></i> Prioridad Media</span>
            <span><i class="fa-solid fa-circle" style="color:var(--accent-cyan); font-size:0.6rem;"></i> Prioridad Baja</span>
          </div>
        </div>

        <div class="debts-grid" id="debts-cards-container">
          <!-- Injected via renderDebtsCards() -->
        </div>
      </div>

      <!-- TAB 2: STRATEGY & SIMULATOR -->
      <div id="strategy-tab" class="tab-content ${currentTab === 'strategy-tab' ? 'active' : ''}">
        <div class="strategy-container" id="strategy-container-mount">
          <!-- Injected via renderStrategyTab() -->
        </div>
      </div>

      <!-- TAB 3: CALENDAR & CASHFLOW TIMELINE -->
      <div id="calendar-tab" class="tab-content ${currentTab === 'calendar-tab' ? 'active' : ''}">
        <div class="calendar-view-container" id="calendar-container-mount">
          <!-- Injected via renderCalendarTab() -->
        </div>
      </div>

      <!-- TAB 4: STRATEGIC TIPS & BANK GUIDELINES -->
      <div id="tips-tab" class="tab-content ${currentTab === 'tips-tab' ? 'active' : ''}">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:1.25rem;">
          <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:1.5rem; backdrop-filter:var(--backdrop-blur);">
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem;">
              <div style="width:36px; height:36px; border-radius:8px; background:rgba(239,68,68,0.15); color:var(--accent-rose); display:flex; align-items:center; justify-content:center;">
                <i class="fa-solid fa-triangle-exclamation"></i>
              </div>
              <h3 style="font-size:1.1rem; font-weight:700;">1. Evita Sobregiro en Tarjetas RD</h3>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.6;">
              Tarjetas como <strong>Banco Vimenca</strong> (balance RD$ 39,200.91 vs límite RD$ 39,000) y <strong>Mastercard Gold</strong> (balance RD$ 35,742 vs límite RD$ 35,000) están por encima del límite. Los bancos en RD cobran una penalidad mensual recurrente por sobregiro (más el 60% de interés anual). Abonar RD$ 300 - RD$ 800 para devolverlas a menos del 95% del límite detiene cargos sorpresa de inmediato.
            </p>
          </div>

          <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:1.5rem; backdrop-filter:var(--backdrop-blur);">
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem;">
              <div style="width:36px; height:36px; border-radius:8px; background:rgba(16,185,129,0.15); color:var(--accent-emerald); display:flex; align-items:center; justify-content:center;">
                <i class="fa-solid fa-coins"></i>
              </div>
              <h3 style="font-size:1.1rem; font-weight:700;">2. Aprovecha Cashback Acumulado</h3>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.6;">
              Tu tarjeta <strong>Qik Banco Digital</strong> muestra <strong>RD$ 3,802.12 de Cashback generado</strong>. En la app de Qik puedes acreditar ese cashback directamente al saldo de la tarjeta en 1 clic. ¡Hazlo hoy! Eso reducirá tu saldo de golpe a RD$ 64,500 sin sacar 1 peso de tu bolsillo.
            </p>
          </div>

          <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:1.5rem; backdrop-filter:var(--backdrop-blur);">
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem;">
              <div style="width:36px; height:36px; border-radius:8px; background:rgba(6,182,212,0.15); color:var(--accent-cyan); display:flex; align-items:center; justify-content:center;">
                <i class="fa-solid fa-bullseye"></i>
              </div>
              <h3 style="font-size:1.1rem; font-weight:700;">3. Liquidar Primero la Póliza (Victoria Rápida)</h3>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.6;">
              El <strong>Préstamo Personal Póliza</strong> solo tiene un saldo de <strong>RD$ 10,295.26</strong> y una cuota de <strong>RD$ 5,427.59</strong>. Con solo 2 cuotas quedará 100% pagado. Al salir de este préstamo, liberarás RD$ 5,427.59 cada mes para tirárselo completo a las tarjetas con 60% de interés.
            </p>
          </div>

          <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:1.5rem; backdrop-filter:var(--backdrop-blur);">
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem;">
              <div style="width:36px; height:36px; border-radius:8px; background:rgba(139,92,246,0.15); color:var(--accent-purple); display:flex; align-items:center; justify-content:center;">
                <i class="fa-solid fa-handshake"></i>
              </div>
              <h3 style="font-size:1.1rem; font-weight:700;">4. Consolidación de Deuda a Futuro</h3>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.6;">
              Las tarjetas de crédito consumen el 60% de interés anual (5% mensual). Tu préstamo personal mayor tiene solo el 16% anual. Si en 3 a 6 meses mantienes tu récord al día, puedes solicitar un préstamo de consolidación bancaria al 18% o 20% para cancelar todas las tarjetas juntas y pagar una sola cuota mucho más baja.
            </p>
          </div>
        </div>
      </div>
    </main>

    <!-- Modal for Editing/Adding Debt -->
    <div id="debt-modal" class="modal-overlay">
      <div class="modal-window">
        <div class="modal-header">
          <div class="modal-title" id="debt-modal-title">Agregar / Editar Deuda</div>
          <button class="btn-icon" id="btn-close-modal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <form id="debt-form">
            <div class="form-group">
              <label class="form-label">Nombre del Producto / Tarjeta</label>
              <input type="text" class="form-control" id="form-name" required placeholder="Ej. Tarjeta Visa Oro">
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Banco / Entidad</label>
                <input type="text" class="form-control" id="form-institution" required placeholder="Ej. Banco Vimenca">
              </div>
              <div class="form-group">
                <label class="form-label">Tipo</label>
                <select class="form-control" id="form-category">
                  <option value="credit_card">Tarjeta de Crédito</option>
                  <option value="loan">Préstamo Personal</option>
                  <option value="other">Otro</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Moneda</label>
                <select class="form-control" id="form-currency">
                  <option value="DOP">RD$ (Pesos Dominicanos)</option>
                  <option value="USD">US$ (Dólares)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Saldo Pendiente Actual</label>
                <input type="number" step="0.01" class="form-control" id="form-balance" required placeholder="0.00">
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Pago Mínimo o Cuota</label>
                <input type="number" step="0.01" class="form-control" id="form-minPayment" required placeholder="0.00">
              </div>
              <div class="form-group">
                <label class="form-label">Límite de Crédito Aprobado</label>
                <input type="number" step="0.01" class="form-control" id="form-creditLimit" placeholder="0.00">
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Tasa de Interés Anual (%)</label>
                <input type="number" step="0.1" class="form-control" id="form-interestRate" required placeholder="60">
              </div>
              <div class="form-group">
                <label class="form-label">Día Límite de Pago (1-31)</label>
                <input type="number" min="1" max="31" class="form-control" id="form-dueDay" required placeholder="15">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Notas Adicionales</label>
              <input type="text" class="form-control" id="form-notes" placeholder="Ej. Corte día 10, cashback disponible...">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-modal">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-debt">Guardar Deuda</button>
        </div>
      </div>
    </div>

    <!-- Modal for Quick Payment / Balance Update -->
    <div id="payment-modal" class="modal-overlay">
      <div class="modal-window" style="max-width: 440px;">
        <div class="modal-header">
          <div class="modal-title" id="pay-modal-title">Registrar Abono a Capital</div>
          <button class="btn-icon" id="btn-close-pay-modal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div id="pay-debt-details-info" style="font-size:0.88rem; color:var(--text-secondary); margin-bottom: 0.5rem;"></div>
          <div class="form-group">
            <label class="form-label">Monto del Pago / Abono Realizado</label>
            <input type="number" step="0.01" class="form-control" id="form-pay-amount" placeholder="0.00">
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted);">
            Esto reducirá el saldo actual directamente. Si abonas el total, la deuda se marcará como liquidada.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-pay-modal">Cancelar</button>
          <button class="btn btn-primary" id="btn-confirm-pay"><i class="fa-solid fa-check"></i> Aplicar Abono</button>
        </div>
      </div>
    </div>

    <!-- Modal for Scheduling Extra Income -->
    <div id="extra-income-modal" class="modal-overlay">
      <div class="modal-window" style="max-width: 480px;">
        <div class="modal-header">
          <div class="modal-title" id="extra-income-modal-title">
            <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-emerald);"></i> Programar Ingreso Extra
          </div>
          <button class="btn-icon" id="btn-close-extra-modal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="form-extra-id">
          
          <div class="form-group">
            <label class="form-label">Concepto o Motivo del Ingreso</label>
            <input type="text" class="form-control" id="form-extra-name" placeholder="Ej. Regalía Pascual / Doble Sueldo">
            <div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.4rem;">
              <button type="button" class="btn-chip-suggest" data-name="Regalía / Doble Sueldo 🎄">Regalía 🎄</button>
              <button type="button" class="btn-chip-suggest" data-name="Bono de Desempeño 💼">Bono Anual 💼</button>
              <button type="button" class="btn-chip-suggest" data-name="Venta / Ingreso Extra 🚗">Venta / Extra 🚗</button>
              <button type="button" class="btn-chip-suggest" data-name="Devolución DGII / Ahorro 💰">Devolución / Ahorro 💰</button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">¿En qué mes lo recibirás?</label>
            <select class="form-control" id="form-extra-month">
              <!-- Populated dynamically via openExtraIncomeModal() -->
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Monto Extra en Pesos Dominicanos (RD$)</label>
            <input type="number" step="100" class="form-control" id="form-extra-amount" placeholder="50000">
            <div style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.4rem;">
              <button type="button" class="btn-chip-amount" data-amount="10000">+RD$ 10,000</button>
              <button type="button" class="btn-chip-amount" data-amount="25000">+RD$ 25,000</button>
              <button type="button" class="btn-chip-amount" data-amount="50000">+RD$ 50,000</button>
              <button type="button" class="btn-chip-amount" data-amount="100000">+RD$ 100,000</button>
            </div>
          </div>

          <div class="form-group" style="margin-top:0.5rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); padding:0.75rem; border-radius:var(--radius-sm);">
            <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer; font-size:0.83rem; font-weight:600;">
              <input type="checkbox" id="form-extra-recurring" style="accent-color:var(--accent-emerald); width:18px; height:18px;">
              <span>¿Es un ingreso recurrente (todos los meses desde ese mes)?</span>
            </label>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.3rem; margin-left:1.75rem;">
              Marca esto si recibes un aumento o negocio fijo recurrente a partir de esa fecha.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-extra-modal">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-extra-income">
            <i class="fa-solid fa-check"></i> Aplicar a la Simulación
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Container -->
    <div class="toast-container" id="toast-container"></div>
  `;

  // Attach App-Level Listeners
  attachAppListeners();
  renderDebtsCards();
  renderStrategyTab();
  renderCalendarTab();
}

// Attach general listeners
function attachAppListeners() {
  // FX Rate change
  const fxInput = document.getElementById('usd-rate-input');
  fxInput.addEventListener('change', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      settings.usdToDopRate = val;
      saveSettings();
      syncSaveSettings(settings);
      renderApp();
      showToast(`Tasa de cambio actualizada a RD$ ${val.toFixed(2)} por US$`);
    }
  });

  // Edit Income
  document.getElementById('btn-edit-income').addEventListener('click', () => {
    const val = prompt('Ingresa tu salario / ingreso mensual neto en RD$:', settings.monthlyIncomeDOP);
    if (val !== null) {
      const num = parseFloat(val);
      if (!isNaN(num) && num >= 0) {
        settings.monthlyIncomeDOP = num;
        saveSettings();
        syncSaveSettings(settings);
        renderApp();
        showToast(`Ingreso actualizado a RD$ ${num.toLocaleString()}`);
      }
    }
  });

  // Save / Export Current Data as Base
  const saveAsBaseBtn = document.getElementById('btn-save-as-base');
  if (saveAsBaseBtn) {
    saveAsBaseBtn.addEventListener('click', () => {
      const exportJson = JSON.stringify(debts, null, 2);
      navigator.clipboard.writeText(exportJson).then(() => {
        alert('✅ ¡Datos copiados al portapapeles!\n\nPega este texto en el chat conmigo para dejarlos grabados permanentemente en el código base.');
        showToast('JSON copiado al portapapeles', 'fa-copy');
      }).catch(() => {
        prompt('Copia estos datos y pégalos en el chat conmigo:', exportJson);
      });
    });
  }

  // Reset Data to defaults
  document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm('¿Deseas restaurar todas las deudas y balances a los valores originales de tus estados de cuenta?')) {
      localStorage.removeItem(STORAGE_DEBTS_KEY);
      localStorage.removeItem(STORAGE_SETTINGS_KEY);
      localStorage.removeItem(STORAGE_PAID_DUE_KEY);
      debts = JSON.parse(JSON.stringify(INITIAL_DEBTS));
      settings = JSON.parse(JSON.stringify(INITIAL_SETTINGS));
      paidDueDates = [];
      saveDebts();
      saveSettings();
      savePaidDueDates();
      renderApp();
      showToast('¡Todos los datos han sido restaurados a sus valores originales!', 'fa-rotate-right');
    }
  });

  // Add Debt button
  document.getElementById('btn-add-debt').addEventListener('click', () => {
    openDebtModal();
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      currentTab = target;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetEl = document.getElementById(target);
      if (targetEl) targetEl.classList.add('active');
    });
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderDebtsCards();
    });
  });

  // Debt Modal close
  document.getElementById('btn-close-modal').addEventListener('click', closeDebtModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeDebtModal);
  document.getElementById('btn-save-debt').addEventListener('click', handleSaveDebt);

  // Pay Modal close
  document.getElementById('btn-close-pay-modal').addEventListener('click', closePayModal);
  document.getElementById('btn-cancel-pay-modal').addEventListener('click', closePayModal);
  document.getElementById('btn-confirm-pay').addEventListener('click', handleConfirmPay);

  // Extra Income Modal listeners
  const closeExtraBtn = document.getElementById('btn-close-extra-modal');
  if (closeExtraBtn) closeExtraBtn.addEventListener('click', closeExtraIncomeModal);
  const cancelExtraBtn = document.getElementById('btn-cancel-extra-modal');
  if (cancelExtraBtn) cancelExtraBtn.addEventListener('click', closeExtraIncomeModal);
  const saveExtraBtn = document.getElementById('btn-save-extra-income');
  if (saveExtraBtn) saveExtraBtn.addEventListener('click', saveExtraIncomeFromModal);

  // Suggestion chips inside Extra Income Modal
  document.querySelectorAll('.btn-chip-suggest').forEach(chip => {
    chip.addEventListener('click', () => {
      const nameInput = document.getElementById('form-extra-name');
      if (nameInput) nameInput.value = chip.dataset.name;
    });
  });

  document.querySelectorAll('.btn-chip-amount').forEach(chip => {
    chip.addEventListener('click', () => {
      const amountInput = document.getElementById('form-extra-amount');
      if (amountInput) amountInput.value = chip.dataset.amount;
    });
  });
}

// Render Debts Cards List
function renderDebtsCards() {
  const container = document.getElementById('debts-cards-container');
  if (!container) return;

  const rate = settings.usdToDopRate || 60.50;

  // Filter debts
  const filtered = debts.filter(d => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'credit_card') return d.category === 'credit_card';
    if (currentFilter === 'loan') return d.category === 'loan';
    if (currentFilter === 'overlimit') {
      return d.creditLimit > 0 && d.balance > d.creditLimit;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:3rem; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-lg); border:1px solid var(--border-subtle);">
        <i class="fa-solid fa-check-circle" style="font-size:2.5rem; color:var(--accent-emerald); margin-bottom:1rem;"></i>
        <h3>No hay deudas en esta categoría</h3>
        <p style="font-size:0.85rem; margin-top:0.3rem;">¡Excelente noticia! Puedes cambiar de filtro o agregar una nueva.</p>
      </div>
    `;
    return;
  }

  // Sort: active first, then highest interest rate
  filtered.sort((a, b) => {
    if (a.status === 'paid' && b.status !== 'paid') return 1;
    if (a.status !== 'paid' && b.status === 'paid') return -1;
    return b.interestRate - a.interestRate;
  });

  container.innerHTML = filtered.map(d => {
    const isPaid = d.status === 'paid' || d.balance <= 0;
    const isOverLimit = d.creditLimit > 0 && d.balance > d.creditLimit;
    const balanceDOP = d.currency === 'USD' ? d.balance * rate : d.balance;
    const minDOP = d.currency === 'USD' ? d.minPayment * rate : d.minPayment;
    
    // Utilization percentage
    const utilPct = d.creditLimit > 0 ? Math.min(Math.round((d.balance / d.creditLimit) * 100), 100) : 100;
    
    // Priority styling class based on interest
    let priorityClass = 'priority-3';
    if (d.interestRate >= 50) priorityClass = 'priority-1';
    else if (d.interestRate >= 20) priorityClass = 'priority-2';

    return `
      <div class="debt-card ${priorityClass} ${isPaid ? 'paid' : ''}">
        <div>
          <div class="card-top">
            <div class="card-badge-row">
              <span class="type-badge ${d.category === 'credit_card' ? 'badge-card' : 'badge-loan'}">
                ${d.category === 'credit_card' ? 'Tarjeta' : 'Préstamo'}
              </span>
              <span class="badge-rate">${d.interestRate}% Anual</span>
              ${isOverLimit ? `<span style="font-size:0.68rem; background:rgba(239,68,68,0.25); color:#fca5a5; padding:0.12rem 0.4rem; border-radius:4px; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Sobregirada</span>` : ''}
              ${isPaid ? `<span style="font-size:0.68rem; background:rgba(16,185,129,0.25); color:#6ee7b7; padding:0.12rem 0.4rem; border-radius:4px; font-weight:700;"><i class="fa-solid fa-check"></i> Pagada</span>` : ''}
            </div>

            <div style="display:flex; gap:0.35rem;">
              <button class="btn-icon btn-edit-debt" data-id="${d.id}" title="Editar deuda">
                <i class="fa-solid fa-pencil" style="font-size:0.8rem;"></i>
              </button>
              <button class="btn-icon btn-delete-debt" data-id="${d.id}" title="Eliminar deuda">
                <i class="fa-solid fa-trash-can" style="font-size:0.8rem; color:#f87171;"></i>
              </button>
            </div>
          </div>

          <h3 class="debt-title">${d.name}</h3>
          <div class="debt-inst"><i class="fa-solid fa-building-columns"></i> ${d.institution}</div>

          <div class="debt-main-balance">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">Saldo Pendiente</div>
            <div class="balance-amount" style="${isPaid ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">
              ${formatCurrency(d.balance, d.currency)}
            </div>
            ${d.currency === 'USD' ? `<div class="balance-secondary">≈ ${formatCurrency(balanceDOP, 'DOP')}</div>` : ''}
          </div>

          <!-- Utilization bar for credit cards -->
          ${d.creditLimit > 0 ? `
            <div class="card-progress-section">
              <div class="progress-header">
                <span>Uso del límite (${utilPct}%)</span>
                <span>Límite: ${formatCurrency(d.creditLimit, d.currency)}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${utilPct}%; ${isOverLimit ? 'background: linear-gradient(90deg, #f43f5e, #e11d48);' : ''}"></div>
              </div>
            </div>
          ` : ''}

          <!-- Details Grid -->
          <div class="card-details-grid">
            <div class="detail-item">
              <span class="detail-label">Pago Mínimo</span>
              <span class="detail-val" style="color:var(--accent-amber);">${formatCurrency(d.minPayment, d.currency)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Fecha Límite Pago</span>
              <span class="detail-val">Día ${d.dueDay} de cada mes</span>
            </div>
          </div>

          ${d.notes ? `
            <div style="font-size:0.75rem; color:var(--text-secondary); background:rgba(255,255,255,0.03); padding:0.5rem 0.65rem; border-radius:6px; margin-bottom:1rem; border-left:2px solid var(--accent-cyan);">
              ${d.notes}
            </div>
          ` : ''}
        </div>

        <div class="card-actions">
          ${!isPaid ? `
            <button class="btn btn-card-pay" data-id="${d.id}">
              <i class="fa-solid fa-hand-holding-dollar"></i> Registrar Abono / Pago
            </button>
          ` : `
            <button class="btn btn-secondary" style="flex:1; justify-content:center; opacity:0.8;" data-reactivate-id="${d.id}">
              <i class="fa-solid fa-rotate-left"></i> Reactivar
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  // Attach card event listeners
  container.querySelectorAll('.btn-edit-debt').forEach(b => {
    b.addEventListener('click', () => openDebtModal(b.dataset.id));
  });

  container.querySelectorAll('.btn-delete-debt').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (confirm('¿Estás seguro de eliminar esta deuda?')) {
        debts = debts.filter(d => d.id !== id);
        saveDebts();
        syncDeleteDebt(id);
        renderApp();
        showToast('Deuda eliminada del registro.');
      }
    });
  });

  container.querySelectorAll('.btn-card-pay').forEach(b => {
    b.addEventListener('click', () => openPayModal(b.dataset.id));
  });

  container.querySelectorAll('[data-reactivate-id]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.reactivateId;
      const target = debts.find(d => d.id === id);
      if (target) {
        target.status = 'active';
        if (target.balance <= 0) {
          // Find original default balance
          const initial = INITIAL_DEBTS.find(d => d.id === id);
          target.balance = initial ? initial.balance : (target.creditLimit || 100);
        }
        saveDebts();
        syncSaveDebt(target);
        renderApp();
        showToast(`Deuda "${target.name}" reactivada con su balance restaurado.`);
      }
    });
  });
}

// Render Strategy Tab
function renderStrategyTab() {
  const mount = document.getElementById('strategy-container-mount');
  if (!mount) return;

  const currentStrategy = settings.strategy || 'avalanche';
  const simulation = simulateRepayment(debts, settings, currentStrategy);
  const altStrategy = currentStrategy === 'avalanche' ? 'snowball' : 'avalanche';
  const altSimulation = simulateRepayment(debts, settings, altStrategy);
  const cascadePlan = calculateCurrentMonthDistribution(debts, settings);

  // Baseline simulation without extra bonuses to calculate accelerator impact
  const baseSettings = { ...settings, monthlyExtras: [] };
  const baselineSimulation = simulateRepayment(debts, baseSettings, currentStrategy);
  const monthsSaved = Math.max(0, baselineSimulation.totalMonths - simulation.totalMonths);
  const interestSaved = Math.max(0, baselineSimulation.totalInterestPaidDOP - simulation.totalInterestPaidDOP);
  const totalExtraInjectedBonuses = (settings.monthlyExtras || []).reduce((acc, curr) => acc + (Number(curr.amountDOP) || 0), 0);

  const interestDiff = Math.abs(simulation.totalInterestPaidDOP - altSimulation.totalInterestPaidDOP);

  mount.innerHTML = `
    <!-- Settings Left Panel -->
    <div class="strategy-settings-panel">
      <div>
        <h3 style="font-size:1.15rem; font-weight:700; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-sliders" style="color:var(--accent-cyan);"></i> Método de Liquidación
        </h3>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">
          Elige la táctica matemática para cancelar tus saldos agresivamente.
        </p>
      </div>

      <div class="strategy-selector">
        <label class="strategy-option ${currentStrategy === 'avalanche' ? 'selected' : ''}">
          <input type="radio" name="strategy-radio" value="avalanche" ${currentStrategy === 'avalanche' ? 'checked' : ''}>
          <div class="strategy-text">
            <h4>Método Avalancha <span class="strategy-badge-rec">Recomendado</span></h4>
            <p>Ataca primero las deudas con la tasa más alta (60% anual en tarjetas RD). Minimiza al máximo el dinero botado en intereses.</p>
          </div>
        </label>

        <label class="strategy-option ${currentStrategy === 'snowball' ? 'selected' : ''}">
          <input type="radio" name="strategy-radio" value="snowball" ${currentStrategy === 'snowball' ? 'checked' : ''}>
          <div class="strategy-text">
            <h4>Método Bola de Nieve (Snowball)</h4>
            <p>Ataca primero el saldo más pequeño sin importar la tasa. Genera victorias psicológicas rápidas liquidando cuentas temprano.</p>
          </div>
        </label>
      </div>

      <!-- Extra Monthly Payment Slider -->
      <div class="input-slider-box">
        <div class="slider-labels">
          <span style="font-size:0.82rem; font-weight:600; color:var(--text-secondary);">Abono Extra Fijo Mensual a Capital</span>
          <span class="slider-val-tag" id="extra-payment-display">${formatCurrency(settings.extraMonthlyPaymentDOP, 'DOP')}</span>
        </div>
        <input type="range" id="extra-payment-slider" min="0" max="30000" step="500" value="${settings.extraMonthlyPaymentDOP}">
        <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-muted);">
          <span>RD$ 0 (Solo mínimos)</span>
          <span>RD$ 15,000</span>
          <span>RD$ 30,000 / mes</span>
        </div>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">
          Cada peso adicional inyectado va directo al capital de la deuda prioritaria número 1, liquidándola meses antes.
        </p>
      </div>

      <!-- Monthly Extras Simulation Box -->
      <div class="monthly-extras-section">
        <div class="monthly-extras-header">
          <div class="monthly-extras-title">
            <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-emerald);"></i>
            <span>Ingresos Extras por Mes</span>
          </div>
          <button type="button" class="btn btn-primary" id="btn-open-add-extra" style="font-size:0.75rem; padding:0.35rem 0.75rem;">
            <i class="fa-solid fa-plus"></i> Programar
          </button>
        </div>
        <p style="font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">
          Simula regalías de navidad, bonos de trabajo o entradas adicionales en meses específicos para ver cómo aceleran tu liquidación.
        </p>

        ${(settings.monthlyExtras && settings.monthlyExtras.length > 0) ? `
          <div class="extras-list">
            ${settings.monthlyExtras.map(item => `
              <div class="extra-item-card">
                <div class="extra-item-left">
                  <div class="extra-item-name">
                    <span>${item.name}</span>
                    ${item.isRecurring ? '<span style="font-size:0.65rem; background:rgba(6,182,212,0.25); color:#67e8f9; padding:0.1rem 0.35rem; border-radius:4px;">Recurrente</span>' : ''}
                  </div>
                  <div class="extra-item-meta">
                    <i class="fa-regular fa-calendar" style="color:var(--accent-cyan);"></i>
                    <span>${getSimulationMonthLabel(item.monthOffset)}</span>
                  </div>
                </div>
                <div class="extra-item-right">
                  <div class="extra-item-amount">+${formatCurrency(item.amountDOP, 'DOP')}</div>
                  <button type="button" class="btn-delete-extra" data-id="${item.id}" title="Eliminar este ingreso extra">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="monthly-extras-empty">
            <i class="fa-solid fa-calendar-plus" style="font-size:1.4rem; opacity:0.4; margin-bottom:0.4rem; display:block;"></i>
            No tienes ingresos extras programados aún.<br>
            Toca en <strong>"+ Programar"</strong> para agregar tu regalía o bonos.
          </div>
        `}
      </div>

      <!-- Fast Action Info Box -->
      <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:var(--radius-md); padding:1rem;">
        <div style="font-weight:700; font-size:0.85rem; color:var(--accent-emerald); display:flex; align-items:center; gap:0.4rem;">
          <i class="fa-solid fa-chart-line"></i> Comparativa Avalancha vs Bola de Nieve
        </div>
        <p style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.35rem; line-height:1.5;">
          ${currentStrategy === 'avalanche' 
            ? `Con Avalancha te ahorras aproximadamente <strong>${formatCurrency(interestDiff, 'DOP')}</strong> en intereses en comparación con pagar primero los saldos pequeños.`
            : `Con Bola de Nieve pagarás <strong>${formatCurrency(interestDiff, 'DOP')}</strong> más en intereses que con Avalancha, pero liquidarás tu primera cuenta más rápido.`}
        </p>
      </div>
    </div>

    <!-- Results Right Panel -->
    <div class="strategy-result-panel">
      <div>
        <h3 style="font-size:1.15rem; font-weight:700; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-flag-checkered" style="color:var(--accent-emerald);"></i> Proyección y Simulación
        </h3>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">
          Simulación matemática paso a paso de tu salida de deudas con los abonos fijos y extras programados.
        </p>
      </div>

      ${(settings.monthlyExtras && settings.monthlyExtras.length > 0) ? `
        <!-- Accelerated Impact Banner -->
        <div class="simulation-impact-card">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
            <div style="font-size:0.85rem; font-weight:800; color:var(--accent-emerald); display:flex; align-items:center; gap:0.45rem;">
              <i class="fa-solid fa-rocket"></i> IMPACTO DE TUS INGRESOS EXTRAS PROGRAMADOS
            </div>
            <span style="font-size:0.75rem; background:rgba(16,185,129,0.25); color:#6ee7b7; padding:0.2rem 0.5rem; border-radius:6px; font-weight:700;">
              ${settings.monthlyExtras.length} bono${settings.monthlyExtras.length > 1 ? 's' : ''} aplicado${settings.monthlyExtras.length > 1 ? 's' : ''}
            </span>
          </div>

          <div class="impact-stats-grid">
            <div class="impact-stat-item">
              <div class="impact-stat-label">Tiempo Ahorrado</div>
              <div class="impact-stat-val" style="color:var(--accent-emerald);">
                ${monthsSaved > 0 ? `-${monthsSaved} Meses` : 'Mismo mes'}
              </div>
              <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.15rem;">
                Sales en ${simulation.totalMonths} meses (vs ${baselineSimulation.totalMonths} meses base)
              </div>
            </div>

            <div class="impact-stat-item">
              <div class="impact-stat-label">Ahorro en Intereses</div>
              <div class="impact-stat-val" style="color:#38bdf8;">
                ${formatCurrency(interestSaved, 'DOP')}
              </div>
              <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.15rem;">
                Intereses que no pagarás al banco
              </div>
            </div>

            <div class="impact-stat-item">
              <div class="impact-stat-label">Total Bonos Extras</div>
              <div class="impact-stat-val" style="color:var(--accent-amber);">
                ${formatCurrency(totalExtraInjectedBonuses, 'DOP')}
              </div>
              <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.15rem;">
                Inyectados directamente a capital
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="result-summary-cards">
        <div class="res-card">
          <div class="res-title">Tiempo Total para Salir</div>
          <div class="res-val highlight">${simulation.totalMonths} Meses</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">
            ≈ ${(simulation.totalMonths / 12).toFixed(1)} años
          </div>
        </div>

        <div class="res-card">
          <div class="res-title">Intereses Totales Proyectados</div>
          <div class="res-val" style="color:var(--accent-rose);">${formatCurrency(simulation.totalInterestPaidDOP, 'DOP')}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">Con pagos y abonos simulados</div>
        </div>

        <div class="res-card">
          <div class="res-title">Primer Objetivo Liquidado</div>
          <div class="res-val saved">
            ${simulation.payoffOrder[0] ? `Mes ${simulation.payoffOrder[0].monthCompleted}` : 'N/A'}
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">
            ${simulation.payoffOrder[0] ? simulation.payoffOrder[0].name.slice(0, 20) : ''}
          </div>
        </div>
      </div>

      <!-- DYNAMIC CASCADE BREAKDOWN CARD -->
      <div style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(16, 185, 129, 0.14) 100%); border: 2px solid var(--accent-cyan); border-radius: var(--radius-md); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.9rem; box-shadow: 0 4px 20px rgba(6, 182, 212, 0.15);">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="background: var(--accent-cyan); color: #000; font-weight: 800; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
              <i class="fa-solid fa-water"></i> REPARTO EN CASCADA DE ESTE MES
            </span>
            <span style="font-size: 0.85rem; color: #fff; font-weight: 700;">
              Total a inyectar: <span style="color:var(--accent-emerald);">${formatCurrency(cascadePlan.totalExtraBudgetDOP, 'DOP')}</span>
            </span>
          </div>
        </div>

        <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.4;">
          Como tu abono extra mensual supera el saldo del primer objetivo, el dinero restante no se queda parado: <strong>rueda inmediatamente al siguiente objetivo</strong> en este mismo mes:
        </p>

        <!-- Cascade Items List -->
        <div style="display:flex; flex-direction:column; gap:0.6rem;">
          ${cascadePlan.breakdown.map((item, idx) => {
            const isFull = item.statusResult === 'wiped_out';
            return `
              <div style="background: rgba(0,0,0,0.35); border: 1px solid ${isFull ? 'rgba(16, 185, 129, 0.4)' : 'rgba(6, 182, 212, 0.4)'}; border-radius: 8px; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; flex-wrap:wrap; gap:0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 26px; height: 26px; border-radius: 50%; background: ${isFull ? 'var(--accent-emerald)' : 'var(--accent-cyan)'}; color: #000; font-weight: 800; font-size: 0.8rem; display: flex; align-items: center; justify-content: center;">
                    ${idx + 1}
                  </div>
                  <div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: #fff; display: flex; align-items: center; gap: 0.4rem;">
                      ${item.name}
                      ${isFull 
                        ? `<span style="font-size: 0.68rem; background: rgba(16,185,129,0.25); color: #6ee7b7; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700;"><i class="fa-solid fa-check"></i> 100% CANCELADA ESTE MES</span>`
                        : `<span style="font-size: 0.68rem; background: rgba(6,182,212,0.25); color: #67e8f9; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 700;">REDUCCIÓN DE CAPITAL</span>`}
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.1rem;">
                      Saldo: ${formatCurrency(item.balanceOriginal, item.currency)} • Tasa: ${item.interestRate}% anual
                    </div>
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:1rem;">
                  <div style="text-align: right;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Monto a Abonarle</div>
                    <div style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 800; color: ${isFull ? 'var(--accent-emerald)' : 'var(--accent-cyan)'};">
                      ${formatCurrency(item.allocatedOriginal, item.currency)}
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">
                      ≈ ${formatCurrency(item.allocatedDOP, 'DOP')}
                    </div>
                  </div>

                  <button class="btn btn-secondary btn-card-pay-cascade" data-id="${item.id}" data-amount="${item.allocatedOriginal.toFixed(2)}" style="padding: 0.4rem 0.75rem; font-size: 0.78rem;" title="Registrar este abono">
                    <i class="fa-solid fa-arrow-down-to-bracket"></i> Pagar
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Strategy action summary -->
        <div style="font-size: 0.8rem; background: rgba(0,0,0,0.25); padding: 0.65rem 0.9rem; border-radius: 6px; border-left: 3px solid var(--accent-emerald); color: var(--text-secondary);">
          <strong style="color: #fff;"><i class="fa-solid fa-list-check" style="color: var(--accent-emerald);"></i> Resumen de tu jugada este mes:</strong><br>
          1. Cubres los pagos mínimos de tus demás cuentas.<br>
          2. Pagas los montos indicados arriba en cada una.<br>
          3. ¡Habrás <strong>eliminado ${cascadePlan.breakdown.filter(b => b.statusResult === 'wiped_out').length} deudas de un solo golpe</strong> en el mes 1!
        </div>
      </div>

      <!-- Monthly Simulation Schedule Table -->
      <div style="margin-top: 0.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <div style="font-size:0.95rem; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:0.45rem;">
            <i class="fa-solid fa-table-list" style="color:var(--accent-cyan);"></i> Proyección Mes a Mes de la Simulación
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">
            Evolución de saldos con tus bonos e intereses
          </span>
        </div>

        <div class="schedule-table-wrap">
          <table class="schedule-table">
            <thead>
              <tr>
                <th>Mes Calendario</th>
                <th>Abono Inyectado</th>
                <th>Interés del Mes</th>
                <th>Cuentas Liquidadas</th>
                <th style="text-align:right;">Saldo Restante Total</th>
              </tr>
            </thead>
            <tbody>
              ${simulation.monthlySchedule.slice(0, 36).map(row => {
                const label = getSimulationMonthLabel(row.month);
                const hasBonus = row.bonusThisMonth > 0;
                const hasPaidDebts = row.debtsPaidThisMonth && row.debtsPaidThisMonth.length > 0;
                return `
                  <tr class="${hasBonus ? 'has-bonus' : ''}">
                    <td>
                      <strong style="color:#fff;">${label}</strong>
                    </td>
                    <td>
                      <div style="font-family:var(--font-heading); font-weight:700; color:${hasBonus ? 'var(--accent-emerald)' : 'var(--text-primary)'};">
                        ${formatCurrency(row.totalExtraThisMonth, 'DOP')}
                      </div>
                      ${hasBonus ? `<span style="font-size:0.65rem; background:rgba(16,185,129,0.25); color:#6ee7b7; padding:0.1rem 0.35rem; border-radius:3px; font-weight:700;">+${formatCurrency(row.bonusThisMonth, 'DOP')} Extra</span>` : ''}
                    </td>
                    <td style="color:var(--accent-rose); font-weight:600;">
                      ${formatCurrency(row.interestThisMonth, 'DOP')}
                    </td>
                    <td>
                      ${hasPaidDebts ? `
                        <div style="display:flex; flex-direction:column; gap:0.25rem;">
                          ${row.debtsPaidThisMonth.map(dName => `
                            <span style="font-size:0.72rem; background:rgba(16,185,129,0.2); color:#6ee7b7; padding:0.15rem 0.45rem; border-radius:4px; font-weight:700; display:inline-flex; align-items:center; gap:0.3rem;">
                              <i class="fa-solid fa-check"></i> ${dName}
                            </span>
                          `).join('')}
                        </div>
                      ` : '<span style="color:var(--text-muted); font-size:0.75rem;">—</span>'}
                    </td>
                    <td style="text-align:right; font-family:var(--font-heading); font-weight:700; color:var(--text-primary);">
                      ${formatCurrency(row.totalRemainingBalance, 'DOP')}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Priority Order Timeline -->
      <div>
        <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary); margin-bottom:0.75rem;">
          Orden Estratégico de Ataque Completo:
        </div>
        <div class="timeline-list">
          ${simulation.payoffOrder.map((item, idx) => {
            const isFirst = idx === 0;
            return `
              <div class="timeline-item ${isFirst ? 'active-target' : ''}">
                <div style="display:flex; align-items:center;">
                  <div class="timeline-step">${idx + 1}</div>
                  <div class="timeline-info">
                    <div class="timeline-name">
                      ${item.name}
                      ${isFirst ? '<span style="font-size:0.65rem; background:var(--accent-cyan); color:var(--text-inverse); padding:0.1rem 0.4rem; border-radius:4px; font-weight:800;">EN LA MIRA AHORA</span>' : ''}
                    </div>
                    <div class="timeline-details">
                      Saldo: ${formatCurrency(item.balance, item.currency)} • Tasa: ${item.interestRate}% anual • Mínimo: ${formatCurrency(item.minPayment, item.currency)}
                    </div>
                  </div>
                </div>

                <div class="timeline-target-payout">
                  <span class="timeline-month-badge">Liquidada: Mes ${item.monthCompleted}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  // Attach strategy listeners
  mount.querySelectorAll('input[name="strategy-radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      settings.strategy = e.target.value;
      saveSettings();
      renderStrategyTab();
    });
  });

  const slider = document.getElementById('extra-payment-slider');
  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('extra-payment-display').textContent = formatCurrency(val, 'DOP');
  });

  slider.addEventListener('change', (e) => {
    const val = parseFloat(e.target.value);
    settings.extraMonthlyPaymentDOP = val;
    saveSettings();
    renderApp();
  });

  // Extra Income simulation buttons
  const addExtraBtn = document.getElementById('btn-open-add-extra');
  if (addExtraBtn) {
    addExtraBtn.addEventListener('click', () => {
      openExtraIncomeModal();
    });
  }

  mount.querySelectorAll('.btn-delete-extra').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteExtraIncome(btn.dataset.id);
    });
  });

  const quickPayBtn = document.getElementById('btn-quick-pay-target');
  if (quickPayBtn) {
    quickPayBtn.addEventListener('click', () => {
      openPayModal(quickPayBtn.dataset.id);
    });
  }

  // Attach cascade pay buttons
  mount.querySelectorAll('.btn-card-pay-cascade').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const suggestedAmount = parseFloat(btn.dataset.amount);
      openPayModal(id, suggestedAmount);
    });
  });
}

// Render Calendar & Cashflow Tab
function renderCalendarTab() {
  const mount = document.getElementById('calendar-container-mount');
  if (!mount) return;

  const rate = settings.usdToDopRate || 60.50;

  // Active debts sorted by dueDay
  const activeDebts = debts
    .filter(d => d.status !== 'paid' && d.balance > 0)
    .sort((a, b) => a.dueDay - b.dueDay);

  // Group by Quincena (1 to 15, and 16 to 31)
  const q1Debts = activeDebts.filter(d => d.dueDay <= 15);
  const q2Debts = activeDebts.filter(d => d.dueDay > 15);

  const q1TotalDOP = q1Debts.reduce((sum, d) => sum + (d.currency === 'USD' ? d.minPayment * rate : d.minPayment), 0);
  const q2TotalDOP = q2Debts.reduce((sum, d) => sum + (d.currency === 'USD' ? d.minPayment * rate : d.minPayment), 0);

  const halfIncome = (settings.monthlyIncomeDOP || 58000) / 2;

  mount.innerHTML = `
    <!-- Left Calendar Schedule -->
    <div class="payment-calendar-card">
      <div class="calendar-header-title">
        <div>
          <h3 style="font-size:1.15rem; font-weight:700;">Cronograma Mensual de Vencimientos</h3>
          <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">
            Marca con el check cada vez que pagues la cuota/mínimo este mes.
          </p>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <button class="btn btn-secondary" id="btn-reset-monthly-checks" style="font-size:0.75rem; padding:0.3rem 0.65rem;" title="Desmarcar todos los checks del mes">
            <i class="fa-solid fa-arrow-rotate-left"></i> Reiniciar Checks
          </button>
          <span style="font-size:0.8rem; background:rgba(255,255,255,0.06); padding:0.35rem 0.75rem; border-radius:var(--radius-full); font-weight:600;">
            ${paidDueDates.length} de ${activeDebts.length} Pagados
          </span>
        </div>
      </div>

      <div class="days-schedule-list">
        ${activeDebts.map(d => {
          const isUrgent = d.dueDay <= 5; // First 5 days of month
          const minDOP = d.currency === 'USD' ? d.minPayment * rate : d.minPayment;
          const isPaidThisMonth = paidDueDates.includes(d.id);
          return `
            <div class="day-schedule-row ${isPaidThisMonth ? 'is-month-paid' : ''}">
              <div class="day-pill ${isUrgent && !isPaidThisMonth ? 'day-urgent' : ''}">
                <span class="day-num">${d.dueDay}</span>
                <span class="day-txt">Día</span>
              </div>

              <div class="schedule-info">
                <div class="schedule-name">
                  ${d.name} 
                  ${d.category === 'loan' ? '<span style="font-size:0.65rem; background:rgba(59,130,246,0.15); color:#60a5fa; padding:0.1rem 0.35rem; border-radius:4px; margin-left:0.3rem;">Préstamo</span>' : ''}
                  ${isPaidThisMonth ? '<span style="font-size:0.68rem; background:rgba(16,185,129,0.25); color:#6ee7b7; padding:0.1rem 0.4rem; border-radius:4px; margin-left:0.4rem; font-weight:700;"><i class="fa-solid fa-check"></i> Pagado este mes</span>' : ''}
                </div>
                <div class="schedule-meta">
                  ${d.institution} • Saldo actual: ${formatCurrency(d.balance, d.currency)}
                </div>
              </div>

              <div class="schedule-amount">
                <span>${formatCurrency(d.minPayment, d.currency)}</span>
                ${d.currency === 'USD' ? `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">≈ ${formatCurrency(minDOP, 'DOP')}</div>` : ''}
              </div>

              <!-- Interactive Check Button -->
              <button class="calendar-check-btn ${isPaidThisMonth ? 'checked' : ''}" data-calendar-id="${d.id}" title="${isPaidThisMonth ? 'Desmarcar pago' : 'Marcar como pagado este mes'}">
                <i class="fa-solid ${isPaidThisMonth ? 'fa-check' : 'fa-circle-check'}"></i>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Right Insights Panel -->
    <div class="income-insights-card">
      <div>
        <h3 style="font-size:1.15rem; font-weight:700;">Distribución por Quincena</h3>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">
          Planifica cuánto sale de tu cobro del día 15 y cuánto del día 30.
        </p>
      </div>

      <div class="quincena-breakdown">
        <!-- Quincena 1 -->
        <div class="quincena-box">
          <div class="q-title">
            <span>Cobro Día 15 (Quincena 1)</span>
            <span style="color:var(--accent-cyan);">Ingreso ≈ ${formatCurrency(halfIncome, 'DOP')}</span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted);">Pagos comprometidos (días 1 al 15):</div>
          <div class="q-val" style="color:var(--accent-amber);">${formatCurrency(q1TotalDOP, 'DOP')}</div>
          
          <ul class="q-list">
            ${q1Debts.map(d => {
              const isChecked = paidDueDates.includes(d.id);
              return `
                <li style="${isChecked ? 'text-decoration:line-through; opacity:0.6;' : ''}">
                  <span>${isChecked ? '<i class="fa-solid fa-check" style="color:var(--accent-emerald); font-size:0.75rem; margin-right:4px;"></i>' : '•'} Día ${d.dueDay}: ${d.name.slice(0, 20)}...</span>
                  <span>${formatCurrency(d.minPayment, d.currency)}</span>
                </li>
              `;
            }).join('')}
          </ul>

          <div style="margin-top:0.6rem; font-size:0.75rem; color:${halfIncome - q1TotalDOP >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}; font-weight:600;">
            Margen restante quincena: ${formatCurrency(halfIncome - q1TotalDOP, 'DOP')}
          </div>
        </div>

        <!-- Quincena 2 -->
        <div class="quincena-box q2">
          <div class="q-title">
            <span>Cobro Día 30 (Quincena 2)</span>
            <span style="color:var(--accent-purple);">Ingreso ≈ ${formatCurrency(halfIncome, 'DOP')}</span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted);">Pagos comprometidos (días 16 al 31):</div>
          <div class="q-val" style="color:var(--accent-amber);">${formatCurrency(q2TotalDOP, 'DOP')}</div>
          
          <ul class="q-list">
            ${q2Debts.map(d => {
              const isChecked = paidDueDates.includes(d.id);
              return `
                <li style="${isChecked ? 'text-decoration:line-through; opacity:0.6;' : ''}">
                  <span>${isChecked ? '<i class="fa-solid fa-check" style="color:var(--accent-emerald); font-size:0.75rem; margin-right:4px;"></i>' : '•'} Día ${d.dueDay}: ${d.name.slice(0, 20)}...</span>
                  <span>${formatCurrency(d.minPayment, d.currency)}</span>
                </li>
              `;
            }).join('')}
          </ul>

          <div style="margin-top:0.6rem; font-size:0.75rem; color:${halfIncome - q2TotalDOP >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}; font-weight:600;">
            Margen restante quincena: ${formatCurrency(halfIncome - q2TotalDOP, 'DOP')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach check button listeners
  mount.querySelectorAll('.calendar-check-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const debtId = btn.dataset.calendarId;
      const willBeChecked = !paidDueDates.includes(debtId);
      if (!willBeChecked) {
        paidDueDates = paidDueDates.filter(id => id !== debtId);
        showToast('Pago desmarcado.');
      } else {
        paidDueDates.push(debtId);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 }
        });
        showToast('¡Pago de cuota mensual registrado con éxito!', 'fa-circle-check');
      }
      savePaidDueDates();
      syncToggleMonthlyCheck(debtId, willBeChecked);
      renderCalendarTab();
    });
  });

  // Reset checks button
  const resetChecksBtn = document.getElementById('btn-reset-monthly-checks');
  if (resetChecksBtn) {
    resetChecksBtn.addEventListener('click', () => {
      if (confirm('¿Deseas reiniciar todos los checks del mes?')) {
        paidDueDates = [];
        savePaidDueDates();
        syncClearMonthlyChecks();
        renderCalendarTab();
        showToast('Checks del mes reiniciados.');
      }
    });
  }
}

// Modal Handlers
function openDebtModal(debtId = null) {
  editingDebtId = debtId;
  const modal = document.getElementById('debt-modal');
  const title = document.getElementById('debt-modal-title');
  const form = document.getElementById('debt-form');

  if (debtId) {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;
    title.textContent = 'Editar Deuda / Tarjeta';
    document.getElementById('form-name').value = debt.name;
    document.getElementById('form-institution').value = debt.institution;
    document.getElementById('form-category').value = debt.category;
    document.getElementById('form-currency').value = debt.currency;
    document.getElementById('form-balance').value = debt.balance;
    document.getElementById('form-minPayment').value = debt.minPayment;
    document.getElementById('form-creditLimit').value = debt.creditLimit || '';
    document.getElementById('form-interestRate').value = debt.interestRate;
    document.getElementById('form-dueDay').value = debt.dueDay;
    document.getElementById('form-notes').value = debt.notes || '';
  } else {
    title.textContent = 'Agregar Nueva Deuda';
    form.reset();
    document.getElementById('form-interestRate').value = '60';
    document.getElementById('form-dueDay').value = '15';
    document.getElementById('form-currency').value = 'DOP';
  }

  modal.classList.add('open');
}

function closeDebtModal() {
  document.getElementById('debt-modal').classList.remove('open');
  editingDebtId = null;
}

function handleSaveDebt(e) {
  e.preventDefault();
  const name = document.getElementById('form-name').value.trim();
  const institution = document.getElementById('form-institution').value.trim();
  const category = document.getElementById('form-category').value;
  const currency = document.getElementById('form-currency').value;
  const balance = parseFloat(document.getElementById('form-balance').value);
  const minPayment = parseFloat(document.getElementById('form-minPayment').value);
  const creditLimit = parseFloat(document.getElementById('form-creditLimit').value) || balance;
  const interestRate = parseFloat(document.getElementById('form-interestRate').value);
  const dueDay = parseInt(document.getElementById('form-dueDay').value, 10);
  const notes = document.getElementById('form-notes').value.trim();

  if (!name || isNaN(balance) || isNaN(minPayment) || isNaN(interestRate) || isNaN(dueDay)) {
    alert('Por favor completa todos los campos requeridos con valores válidos.');
    return;
  }

  let savedTargetDebt = null;
  if (editingDebtId) {
    const index = debts.findIndex(d => d.id === editingDebtId);
    if (index !== -1) {
      debts[index] = {
        ...debts[index],
        name,
        institution,
        category,
        currency,
        balance,
        minPayment,
        creditLimit,
        interestRate,
        dueDay,
        notes,
        status: balance <= 0 ? 'paid' : 'active'
      };
    savedTargetDebt = debts[index];
      showToast('Deuda actualizada con éxito.');
    }
  } else {
    const newDebt = {
      id: 'debt-' + Date.now(),
      name,
      institution,
      category,
      currency,
      balance,
      minPayment,
      creditLimit,
      interestRate,
      dueDay,
      notes,
      status: balance <= 0 ? 'paid' : 'active'
    };
    debts.push(newDebt);
    savedTargetDebt = newDebt;
    showToast('Nueva deuda registrada.');
  }

  saveDebts();
  if (savedTargetDebt) syncSaveDebt(savedTargetDebt);
  closeDebtModal();
  renderApp();
}

// Payment Modal Handlers
let payingDebtId = null;

function openPayModal(debtId, customAmount = null) {
  payingDebtId = debtId;
  const debt = debts.find(d => d.id === debtId);
  if (!debt) return;

  const modal = document.getElementById('payment-modal');
  const info = document.getElementById('pay-debt-details-info');
  const amountInput = document.getElementById('form-pay-amount');

  info.innerHTML = `
    <strong>${debt.name}</strong> (${debt.institution})<br>
    Saldo pendiente actual: <span style="color:#fff; font-weight:700;">${formatCurrency(debt.balance, debt.currency)}</span><br>
    Pago mínimo sugerido: <span style="color:var(--accent-amber); font-weight:600;">${formatCurrency(debt.minPayment, debt.currency)}</span>
  `;

  amountInput.value = customAmount !== null ? customAmount : debt.minPayment;
  amountInput.max = debt.balance;
  modal.classList.add('open');
}

function closePayModal() {
  document.getElementById('payment-modal').classList.remove('open');
  payingDebtId = null;
}

function handleConfirmPay() {
  if (!payingDebtId) return;
  const debt = debts.find(d => d.id === payingDebtId);
  if (!debt) return;

  const amount = parseFloat(document.getElementById('form-pay-amount').value);
  if (isNaN(amount) || amount <= 0) {
    alert('Ingresa un monto válido para el abono.');
    return;
  }

  debt.balance = Math.max(0, debt.balance - amount);

  if (debt.balance <= 0) {
    debt.status = 'paid';
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    showToast(`🎉 ¡Felicidades! Liquidaste por completo: ${debt.name}`, 'fa-trophy');
  } else {
    showToast(`Abono de ${formatCurrency(amount, debt.currency)} aplicado con éxito.`);
  }

  saveDebts();
  syncSaveDebt(debt);
  closePayModal();
  renderApp();
}

// Extra Income Simulation Handlers
function openExtraIncomeModal(extraId = null) {
  const modal = document.getElementById('extra-income-modal');
  if (!modal) return;
  const idInput = document.getElementById('form-extra-id');
  const nameInput = document.getElementById('form-extra-name');
  const monthSelect = document.getElementById('form-extra-month');
  const amountInput = document.getElementById('form-extra-amount');
  const recurringCheck = document.getElementById('form-extra-recurring');

  // Populate month options (1 to 24)
  monthSelect.innerHTML = Array.from({ length: 24 }, (_, i) => {
    const m = i + 1;
    const label = getSimulationMonthLabel(m);
    return `<option value="${m}">${label}</option>`;
  }).join('');

  if (extraId) {
    const item = (settings.monthlyExtras || []).find(e => e.id === extraId);
    if (item) {
      idInput.value = item.id;
      nameInput.value = item.name;
      monthSelect.value = item.monthOffset;
      amountInput.value = item.amountDOP;
      recurringCheck.checked = !!item.isRecurring;
    }
  } else {
    idInput.value = '';
    nameInput.value = '';
    monthSelect.value = '3'; // Default to Month 3 (Diciembre / Doble sueldo)
    amountInput.value = '';
    recurringCheck.checked = false;
  }

  modal.classList.add('open');
}

function closeExtraIncomeModal() {
  const modal = document.getElementById('extra-income-modal');
  if (modal) modal.classList.remove('open');
}

function saveExtraIncomeFromModal() {
  const idInput = document.getElementById('form-extra-id');
  const nameInput = document.getElementById('form-extra-name');
  const monthSelect = document.getElementById('form-extra-month');
  const amountInput = document.getElementById('form-extra-amount');
  const recurringCheck = document.getElementById('form-extra-recurring');

  const amount = parseFloat(amountInput.value);
  if (isNaN(amount) || amount <= 0) {
    alert('Por favor ingresa un monto válido mayor a 0 en RD$');
    return;
  }

  const monthOffset = parseInt(monthSelect.value, 10) || 1;
  const name = nameInput.value.trim() || 'Ingreso Extra';
  const isRecurring = recurringCheck.checked;

  if (!settings.monthlyExtras) settings.monthlyExtras = [];

  if (idInput.value) {
    const idx = settings.monthlyExtras.findIndex(e => e.id === idInput.value);
    if (idx !== -1) {
      settings.monthlyExtras[idx] = {
        id: idInput.value,
        name,
        monthOffset,
        amountDOP: amount,
        isRecurring
      };
    }
  } else {
    settings.monthlyExtras.push({
      id: `extra-${Date.now()}`,
      name,
      monthOffset,
      amountDOP: amount,
      isRecurring
    });
  }

  // Sort by month
  settings.monthlyExtras.sort((a, b) => a.monthOffset - b.monthOffset);

  saveSettings();
  closeExtraIncomeModal();
  renderStrategyTab();
  showToast(`¡Ingreso extra de RD$ ${amount.toLocaleString()} programado en ${getSimulationMonthLabel(monthOffset)}!`, 'fa-wand-magic-sparkles');
}

function deleteExtraIncome(id) {
  if (confirm('¿Deseas eliminar este ingreso extra de la simulación?')) {
    settings.monthlyExtras = (settings.monthlyExtras || []).filter(e => e.id !== id);
    saveSettings();
    renderStrategyTab();
    showToast('Ingreso extra removido de la simulación');
  }
}

// Initialize Cloud Sync & Realtime
async function initCloudSync() {
  try {
    const [cloudDebts, cloudSettings, cloudChecks] = await Promise.all([
      syncFetchDebts(),
      syncFetchSettings(),
      syncFetchMonthlyChecks()
    ]);

    if (cloudDebts && cloudDebts.length > 0) {
      debts = cloudDebts;
      saveDebts();
    }
    if (cloudSettings) {
      settings = cloudSettings;
      saveSettings();
    }
    if (cloudChecks) {
      paidDueDates = cloudChecks;
      savePaidDueDates();
    }

    isCloudSynced = true;
    renderApp();

    // Setup Supabase Realtime Channels for instant multi-device live sync
    supabase.channel('cloud-debts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, async () => {
        const fresh = await syncFetchDebts();
        if (fresh) {
          debts = fresh;
          saveDebts();
          renderApp();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_checks' }, async () => {
        const freshChecks = await syncFetchMonthlyChecks();
        if (freshChecks) {
          paidDueDates = freshChecks;
          savePaidDueDates();
          renderCalendarTab();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, async () => {
        const freshSettings = await syncFetchSettings();
        if (freshSettings) {
          settings = freshSettings;
          saveSettings();
          renderApp();
        }
      })
      .subscribe();
  } catch (err) {
    console.warn('Supabase realtime init error:', err);
  }
}

// Boot application
renderApp();
initCloudSync();

