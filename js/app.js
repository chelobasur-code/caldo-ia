document.addEventListener("DOMContentLoaded", function () {
  const apiUrl = 'https://caldo-ia-back.onrender.com';
  const userData = JSON.parse(localStorage.getItem('caldoIAUser') || '{}');
  const defaultUser = {
    phone: '',
    poultryType: 'pollo',
    birds: 1000,
    avgWeight: 2.4,
    days: 1,
    area: 10,
    targetTemp: 35,
    targetHumidity: 60,
    planType: 'normal',
    customPlan: null,
    tankLevels: { agua: 'medio', vacc: 'rest', vit: 'rest', premix: 'rest' },
    selectedProducts: [],
    productState: {},
    metrics: {}
  };
  const state = { ...defaultUser, ...userData };
  const screens = document.querySelectorAll('.screen');
  const navItems = document.querySelectorAll('.nav-item');
  let currentScreen = 'home';
  let planData = null;
  let currentTank = 'agua';
  let currentRound = 1;
  let currentRecipe = null;
  let currentRecipeDate = null;
  let currentOrder = [];
  let selectedProducts = [];
  let bookingModalOpen = false;
  let currentProductDetails = null;
  let dragSrcIndex = null;
  let productCatalog = [];
  const sessionToken = localStorage.getItem('caldoIAAuthToken');
  let isLoginModalOpen = false;

  function saveState() {
    localStorage.setItem('caldoIAUser', JSON.stringify(state));
  }

  function getScreenElements(screenName) {
    return document.querySelector(`[data-screen="${screenName}"]`);
  }

  function showScreen(screenName) {
    screens.forEach(screen => {
      screen.classList.toggle('hidden', screen.dataset.screen !== screenName);
    });

    navItems.forEach(item => {
      const isActive = item.dataset.screen === screenName;
      item.classList.toggle('active', isActive);
      item.style.color = isActive ? '#0f172a' : '#475569';
      item.style.fontWeight = isActive ? '700' : '600';
    });

    currentScreen = screenName;
    if (screenName === 'sales' && planData) {
      renderPlanView();
    }
    if (screenName === 'products') {
      renderProductCatalog();
    }
  }

  function syncPhoneValue() {
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
      state.phone = phoneInput.value.trim();
      saveState();
    }
  }

  function initStateFromStorage() {
    if (!state.phone) {
      const savedPhone = localStorage.getItem('caldo_ia_phone') || '';
      state.phone = savedPhone;
      saveState();
    }
    if (state.productState && Object.keys(state.productState).length) {
      selectedProducts = Array.isArray(state.selectedProducts) ? [...state.selectedProducts] : [];
      currentOrder = [...selectedProducts];
      state.productState = { ...state.productState };
    }
    if (typeof state.tankLevels !== 'object' || !state.tankLevels) {
      state.tankLevels = { agua: 'medio', vacc: 'rest', vit: 'rest', premix: 'rest' };
    }
  }

  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  }

  function showToast(message, actionLabel = null, onAction = null) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const text = toast.querySelector('.toast-text');
    const actionBtn = toast.querySelector('.toast-action');
    text.textContent = message;
    if (actionLabel && onAction) {
      actionBtn.textContent = actionLabel;
      actionBtn.classList.remove('hidden');
      actionBtn.onclick = () => {
        onAction();
        hideToast();
      };
    } else {
      actionBtn.classList.add('hidden');
      actionBtn.onclick = null;
    }
    toast.classList.remove('hidden');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(hideToast, 3500);
  }

  function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.classList.add('hidden');
  }

  function formatNumber(value, decimals = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return num.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function calculateProductTotal(product, quantity) {
    if (!product || !quantity) return 0;
    const q = Number(quantity);
    const dose = Number(product.dose_ml || product.dose || 0);
    const total = q * dose;
    return Number.isFinite(total) ? total : 0;
  }

  function buildProductStateFromSelection() {
    const stateMap = {};
    currentOrder.forEach(item => {
      stateMap[item.productId] = {
        quantity: item.quantity,
        notes: item.notes || ''
      };
    });
    return stateMap;
  }

  function getProductById(productId) {
    return productCatalog.find(item => item.id === productId);
  }

  function renderProductSummary() {
    const productSummaryEl = document.getElementById('productSummary');
    if (!productSummaryEl) return;
    selectedProducts = currentOrder.filter(item => Number(item.quantity) > 0);
    state.selectedProducts = [...selectedProducts];
    state.productState = buildProductStateFromSelection();
    saveState();

    if (!selectedProducts.length) {
      productSummaryEl.innerHTML = '<div class="product-mix-empty">Aún no has agregado productos al mix.</div>';
      return;
    }

    const tbody = selectedProducts.map((item, index) => {
      const product = getProductById(item.productId);
      const quantity = Number(item.quantity) || 0;
      const total = calculateProductTotal(product, quantity);
      const doseText = product && product.dose_ml ? `${product.dose_ml} ml` : 'N/A';
      const unit = product && product.unit ? ` / ${product.unit}` : '';
      const itemName = product ? product.name : 'Producto desconocido';
      return `
        <div class="mix-item" draggable="true" data-index="${index}" data-product-id="${item.productId}">
          <div class="order-badge">${index + 1}</div>
          <div class="mix-item-content">
            <div class="mix-item-name"><strong>${itemName}</strong></div>
            <div class="mix-item-meta">${quantity}${unit} × ${doseText}</div>
          </div>
          <div class="mix-item-total">${formatNumber(total, 1)} ml</div>
        </div>`;
    }).join('');

    productSummaryEl.innerHTML = `<div class="product-mix-summary mix-table">${tbody}</div>`;
    attachDragAndDropHandlers();
  }

  function attachDragAndDropHandlers() {
    const items = document.querySelectorAll('#productSummary .mix-item');
    items.forEach(item => {
      item.addEventListener('dragstart', (event) => {
        dragSrcIndex = Number(event.currentTarget.dataset.index);
        event.currentTarget.classList.add('dragging');
      });
      item.addEventListener('dragend', (event) => {
        event.currentTarget.classList.remove('dragging');
      });
      item.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
      });
      item.addEventListener('dragleave', (event) => {
        event.currentTarget.classList.remove('drag-over');
      });
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        const targetIndex = Number(event.currentTarget.dataset.index);
        if (dragSrcIndex === null || targetIndex === dragSrcIndex) return;
        const [moved] = currentOrder.splice(dragSrcIndex, 1);
        currentOrder.splice(targetIndex, 0, moved);
        renderProductSummary();
      });
    });
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      bookingModalOpen = true;
    }
  }

  function closeBookingModal() {
    hideModal('bookingModal');
    bookingModalOpen = false;
  }

  function generateBookingUrl() {
    const selectedDate = document.getElementById('bookingDate')?.value;
    const selectedTime = document.getElementById('bookingTime')?.value;
    const selectedMethod = document.querySelector('input[name="bookingMethod"]:checked')?.value;
    const phone = state.phone || '';
    const amount = state.totalDryMilk || 0;
    const message = `Hola Caldo IA, tengo una consulta para el plan del día ${selectedDate} a las ${selectedTime}. Método: ${selectedMethod}. Teléfono: ${phone}. Total estimado: ${amount} kg.`;
    const encoded = encodeURIComponent(message);
    if (selectedMethod === 'whatsapp') {
      window.open(`https://wa.me/573112345678?text=${encoded}`, '_blank');
    } else {
      window.location.href = `mailto:ventas@caldoia.com?subject=Reserva%20Caldo%20IA&body=${encoded}`;
    }
    closeBookingModal();
  }

  function updateTankState() {
    const tankLevels = state.tankLevels || {};
    ['agua', 'vacc', 'vit', 'premix'].forEach(key => {
      const button = document.querySelector(`[data-tank="${key}"]`);
      if (!button) return;
      const level = tankLevels[key] || 'rest';
      const isFilled = level !== 'rest';
      button.classList.toggle('filled', isFilled);
      button.classList.toggle('rest', !isFilled);
      button.textContent = button.dataset.label + (isFilled ? `\n${level}` : '');
    });
  }

  function setTankLevel(levelKey, level) {
    state.tankLevels = state.tankLevels || {};
    state.tankLevels[levelKey] = level;
    saveState();
    updateTankState();
  }

  function updateMetrics() {
    const birds = Number(state.birds || 0);
    const avgWeight = Number(state.avgWeight || 0);
    const days = Number(state.days || 0);
    const area = Number(state.area || 0);
    const feedPerBird = 0.13;
    const totalFeed = birds * feedPerBird;
    const water = birds * 0.25;
    const protein = totalFeed * 0.18;
    const waste = totalFeed * 0.12;
    const humidity = Number(state.targetHumidity || 0);
    const temp = Number(state.targetTemp || 0);
    const stocking = birds / area;
    const liters = totalFeed * 1000;
    state.metrics = {
      totalFeed,
      water,
      protein,
      waste,
      liters,
      humidity,
      temp,
      stocking
    };
    document.getElementById('birdsValue')?.textContent = formatNumber(birds);
    document.getElementById('feedValue')?.textContent = formatNumber(totalFeed, 2) + ' kg';
    document.getElementById('waterValue')?.textContent = formatNumber(water, 2) + ' L';
    document.getElementById('proteinValue')?.textContent = formatNumber(protein, 2) + ' kg';
    document.getElementById('wasteValue')?.textContent = formatNumber(waste, 2) + ' kg';
    document.getElementById('tempValue')?.textContent = temp + '°C';
    document.getElementById('humidityValue')?.textContent = humidity + '%';
    document.getElementById('stockingValue')?.textContent = formatNumber(stocking, 2) + ' aves/m²';
    document.getElementById('totalFeedValue')?.textContent = formatNumber(liters, 1) + ' ml';
  }

  function renderProductCatalog() {
    const catalog = document.getElementById('productCatalog');
    if (!catalog) return;
    const products = productCatalog.map((product, index) => {
      const isSelected = selectedProducts.some(item => item.productId === product.id);
      return `<button type="button" class="catalog-item ${isSelected ? 'disabled' : ''}" data-product-id="${product.id}" ${isSelected ? 'disabled' : ''}>
        <div>
          <div>${product.name}</div>
          <div class="catalog-meta">${product.type} • ${product.dose_ml} ml</div>
        </div>
        <span>${product.category}</span>
      </button>`;
    }).join('');
    catalog.innerHTML = products;
    catalog.querySelectorAll('.catalog-item').forEach(button => {
      button.addEventListener('click', () => {
        const productId = button.dataset.productId;
        const product = getProductById(productId);
        if (!product) return;
        const current = currentOrder.find(item => item.productId === productId);
        if (current) {
          showToast('Este producto ya está en tu mix.');
          return;
        }
        const quantity = 1;
        currentOrder.push({ productId, quantity, notes: '' });
        renderProductSummary();
        renderProductCatalog();
      });
    });
  }

  async function fetchProducts() {
    try {
      const response = await fetch(`${apiUrl}/api/products`);
      if (!response.ok) throw new Error('No se pudo cargar catálogo');
      const data = await response.json();
      productCatalog = Array.isArray(data) ? data : [];
      renderProductCatalog();
    } catch (error) {
      console.error(error);
      productCatalog = [];
    }
  }

  function renderPlanView() {
    const planEl = document.getElementById('planContent');
    if (!planEl || !planData) return;

    const plan = planData.plan || {};
    const planType = planData.planType || 'normal';
    const planLabel = planType === 'custom' ? 'Personalizada' : 'Estándar';
    const planVolume = Number(planData.volumeMl || 0);
    const planSteps = Array.isArray(plan.steps) ? plan.steps : [];
    const planHint = planData.notes || 'Revisa la dosificación y ajusta según el clima.';

    const stepsMarkup = planSteps.map((step, index) => `
      <div class="plan-step">
        <div class="step-badge">${index + 1}</div>
        <div>
          <strong>${step.title || `Paso ${index + 1}`}</strong>
          <small>${step.description || ''}</small>
        </div>
        <div>${step.value || ''}</div>
      </div>`).join('');

    planEl.innerHTML = `
      <div class="plan-card">
        <div class="plan-title-row">
          <div>
            <div class="step-pill">${planLabel}</div>
            <p class="plan-plan-volume">${formatNumber(planVolume, 1)} ml</p>
          </div>
          <div class="plan-plan-info">${planData.summary || 'Plan multi-etapa listo para usar.'}</div>
        </div>
        <div class="plan-steps">${stepsMarkup}</div>
        <div class="plan-note"><span class="plan-note-icon">💡</span><div>${planHint}</div></div>
      </div>`;
  }

  function buildDefaultPlanData() {
    const birds = Number(state.birds || 1000);
    const avgWeight = Number(state.avgWeight || 2.4);
    const totalFeed = birds * 0.13;
    return {
      planType: state.planType || 'normal',
      volumeMl: totalFeed * 1000,
      summary: `Total estimado ${formatNumber(totalFeed, 2)} kg de alimento para ${formatNumber(birds)} aves.`,
      notes: 'Mantén la temperatura y la ventilación estables durante la primera semana.',
      plan: {
        steps: [
          { title: 'Inicio', description: 'Verifica consumo y temperatura.', value: `${formatNumber(totalFeed / 2, 2)} kg` },
          { title: 'Crecimiento', description: 'Ajusta ventilación y mezcla.', value: `${formatNumber(totalFeed * 0.7, 2)} kg` },
          { title: 'Cierre', description: 'Monitorea humedad y saciedad.', value: `${formatNumber(totalFeed * 0.3, 2)} kg` }
        ]
      }
    };
  }

  async function loadPlan() {
    try {
      const response = await fetch(`${apiUrl}/api/latest-plan?phone=${encodeURIComponent(state.phone || '')}`, {
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
      });
      if (!response.ok) throw new Error('No plan');
      const data = await response.json();
      planData = data;
      renderPlanView();
    } catch (error) {
      planData = buildDefaultPlanData();
      renderPlanView();
    }
  }

  async function submitPlan() {
    const form = document.getElementById('customPlanForm');
    if (!form) return;

    const payload = {
      phone: state.phone,
      poultryType: getInputValue('poultryType') || state.poultryType,
      birds: Number(getInputValue('birds') || state.birds),
      avgWeight: Number(getInputValue('avgWeight') || state.avgWeight),
      days: Number(getInputValue('days') || state.days),
      area: Number(getInputValue('area') || state.area),
      targetTemp: Number(getInputValue('targetTemp') || state.targetTemp),
      targetHumidity: Number(getInputValue('targetHumidity') || state.targetHumidity),
      planType: getInputValue('planType') || state.planType,
      customPlan: getInputValue('customPlan') || '',
      selectedProducts: currentOrder
    };

    state.poultryType = payload.poultryType;
    state.birds = payload.birds;
    state.avgWeight = payload.avgWeight;
    state.days = payload.days;
    state.area = payload.area;
    state.targetTemp = payload.targetTemp;
    state.targetHumidity = payload.targetHumidity;
    state.planType = payload.planType;
    state.customPlan = payload.customPlan;
    saveState();

    try {
      const response = await fetch(`${apiUrl}/api/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: sessionToken ? `Bearer ${sessionToken}` : ''
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('No se pudo guardar el plan');
      const data = await response.json();
      planData = data;
      renderPlanView();
      showScreen('sales');
      showToast('Plan actualizado correctamente');
    } catch (error) {
      console.error(error);
      showToast('No se pudo guardar el plan, usando datos locales');
      planData = buildDefaultPlanData();
      renderPlanView();
      showScreen('sales');
    }
  }

  async function initAuth() {
    const loginButton = document.getElementById('loginButton');
    const authModal = document.getElementById('loginModal');
    const loginForm = document.getElementById('loginForm');
    const logoutButton = document.getElementById('logoutButton');

    if (!loginButton || !authModal || !loginForm || !logoutButton) return;

    if (sessionToken) {
      loginButton.textContent = 'Sesión activa';
      logoutButton.classList.remove('hidden');
      return;
    }

    loginButton.addEventListener('click', () => {
      authModal.classList.remove('hidden');
      isLoginModalOpen = true;
    });

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      try {
        const response = await fetch(`${apiUrl}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (!response.ok) throw new Error('Credenciales inválidas');
        const data = await response.json();
        localStorage.setItem('caldoIAAuthToken', data.token);
        authModal.classList.add('hidden');
        isLoginModalOpen = false;
        loginButton.textContent = 'Sesión activa';
        logoutButton.classList.remove('hidden');
        showToast('Inicio de sesión correcto');
      } catch (error) {
        showToast('No se pudo iniciar sesión');
      }
    });

    logoutButton.addEventListener('click', () => {
      localStorage.removeItem('caldoIAAuthToken');
      logoutButton.classList.add('hidden');
      loginButton.textContent = 'Iniciar sesión';
      showToast('Sesión cerrada');
    });
  }

  function bindEvents() {
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const screen = item.dataset.screen;
        if (!screen) return;
        showScreen(screen);
      });
    });

    document.getElementById('savePlan')?.addEventListener('click', submitPlan);
    document.getElementById('phone')?.addEventListener('input', syncPhoneValue);

    document.querySelectorAll('.back-button').forEach(button => {
      button.addEventListener('click', () => showScreen('home'));
    });

    document.querySelectorAll('.tank-button').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.tank;
        const level = button.dataset.level;
        if (!key || !level) return;
        setTankLevel(key, level);
      });
    });

    document.getElementById('bookingOpenBtn')?.addEventListener('click', () => openModal('bookingModal'));
    document.getElementById('generateBooking')?.addEventListener('click', generateBookingUrl);
    document.getElementById('closeBookingModal')?.addEventListener('click', closeBookingModal);
    document.getElementById('closeLoginModal')?.addEventListener('click', () => {
      document.getElementById('loginModal')?.classList.add('hidden');
      isLoginModalOpen = false;
    });

    document.getElementById('profileButton')?.addEventListener('click', () => {
      showScreen('profile');
    });

    document.getElementById('resetMix')?.addEventListener('click', () => {
      currentOrder = [];
      renderProductSummary();
      renderProductCatalog();
      showToast('Mix reiniciado');
    });

    document.getElementById('planType')?.addEventListener('change', (event) => {
      state.planType = event.target.value;
      saveState();
    });

    document.getElementById('roundSelector')?.addEventListener('change', (event) => {
      currentRound = Number(event.target.value);
    });

    document.getElementById('recipeSelector')?.addEventListener('change', (event) => {
      currentRecipe = event.target.value;
    });

    document.getElementById('recipeDate')?.addEventListener('change', (event) => {
      currentRecipeDate = event.target.value;
    });
  }

  function hydrateForm() {
    setInputValue('phone', state.phone || '');
    setInputValue('poultryType', state.poultryType || 'pollo');
    setInputValue('birds', state.birds || 1000);
    setInputValue('avgWeight', state.avgWeight || 2.4);
    setInputValue('days', state.days || 1);
    setInputValue('area', state.area || 10);
    setInputValue('targetTemp', state.targetTemp || 35);
    setInputValue('targetHumidity', state.targetHumidity || 60);
    setInputValue('planType', state.planType || 'normal');
    setInputValue('customPlan', state.customPlan || '');
    updateMetrics();
    updateTankState();
    renderProductSummary();
    loadPlan();
    fetchProducts();
  }

  function init() {
    initStateFromStorage();
    hydrateForm();
    bindEvents();
    initAuth();
    showScreen(currentScreen);
  }

  init();
});
