// Joriy chat ID
let currentChatId = null;

function getChats() {
  try {
    return JSON.parse(localStorage.getItem('axis_chats') || '[]');
  } catch (e) {
    return [];
  }
}

function setChats(chats) {
  localStorage.setItem('axis_chats', JSON.stringify(chats));
}

function escapeHistoryHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatChatName(text) {
  const raw = String(text || '').trim().replace(/\s+/g, ' ');
  if (!raw) return 'Yangi Chat';
  const short = raw.slice(0, 40);
  return short
    .split(' ')
    .map(word => word ? word[0].toUpperCase() + word.slice(1) : word)
    .join(' ');
}

function closeHistoryMenus() {
  document.querySelectorAll('.chat-history-menu.open').forEach(menu => {
    menu.classList.remove('open');
  });
}

function hasChatState() {
  return typeof AppState !== 'undefined' && Array.isArray(AppState.conversation);
}

function hasUIController() {
  return typeof UIController !== 'undefined';
}

// Hozirgi chatni saqlash
function saveCurrentChat() {
  if (!hasChatState() || AppState.conversation.length === 0) return;

  const chats = getChats();
  const firstName = formatChatName(AppState.conversation[0]?.content || 'Yangi chat');

  if (currentChatId) {
    const idx = chats.findIndex(c => c.id === currentChatId);
    if (idx !== -1) {
      chats[idx].messages = AppState.conversation;
      chats[idx].name = firstName;
    }
  } else {
    currentChatId = Date.now();
    chats.unshift({
      id: currentChatId,
      name: firstName,
      messages: AppState.conversation,
      pinned: false,
    });
  }

  setChats(chats);
  renderChatHistory();
}

// Chat tarixini ko'rsatish
function renderChatHistory() {
  const container = document.getElementById('chatHistory');
  if (!container) return;

  const chats = getChats();
  const sorted = [...chats].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.id - a.id;
  });

  container.innerHTML = sorted.map(chat => {
    const name = escapeHistoryHtml(formatChatName(chat.name || 'Yangi chat'));
    const pinLabel = chat.pinned ? 'Unpin chat' : 'Pin chat';

    return `
      <div class="chat-history-item ${chat.id === currentChatId ? 'active' : ''}">
        <button class="chat-history-title" onclick="loadChat(${chat.id})" title="${name}">
          ${chat.pinned ? '<span class="pin-mark">Pinned</span>' : ''}
          <span class="chat-history-name">${name}</span>
        </button>
        <div class="chat-history-actions">
          <button class="chat-history-more" onclick="toggleHistoryMenu(event, ${chat.id})" title="More">...</button>
          <div class="chat-history-menu" id="historyMenu-${chat.id}">
            <button class="chat-history-menu-item" onclick="togglePin(${chat.id})">
              <i class="ph ph-push-pin-simple"></i>
              <span>${pinLabel}</span>
            </button>
            <button class="chat-history-menu-item delete" onclick="deleteChat(${chat.id})">
              <i class="ph ph-trash"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleHistoryMenu(event, chatId) {
  event.stopPropagation();
  const menu = document.getElementById(`historyMenu-${chatId}`);
  const shouldOpen = !menu?.classList.contains('open');
  closeHistoryMenus();
  if (menu && shouldOpen) {
    const buttonRect = event.currentTarget.getBoundingClientRect();
    menu.style.top = `${Math.max(12, buttonRect.top - 8)}px`;
    menu.style.left = `${buttonRect.right + 10}px`;
    menu.classList.add('open');
  }
}

function togglePin(id) {
  const chats = getChats();
  const chat = chats.find(c => c.id === id);
  if (!chat) return;

  chat.pinned = !chat.pinned;
  setChats(chats);
  closeHistoryMenus();
  renderChatHistory();
}

function deleteChat(id) {
  const chats = getChats().filter(c => c.id !== id);
  setChats(chats);
  closeHistoryMenus();

  if (currentChatId === id) {
    currentChatId = null;
    if (hasChatState()) AppState.conversation = [];
    if (hasUIController() && UIController.renderEmptyState) UIController.renderEmptyState();
  }

  renderChatHistory();
}

// Chatni yuklash
function loadChat(id) {
  saveCurrentChat();
  const chat = getChats().find(c => c.id === id);
  if (!chat || !hasChatState() || !hasUIController()) return;

  currentChatId = chat.id;
  AppState.conversation = chat.messages || [];
  if (typeof closeBlankPage === 'function') closeBlankPage();
  UIController.renderConversation();
  renderChatHistory();
}

// newChat yangilandi
function newChat() {
  saveCurrentChat();
  currentChatId = null;
  if (hasChatState()) AppState.conversation = [];
  if (hasUIController() && UIController.els?.inp) { UIController.els.inp.value = ''; resize(UIController.els.inp); }
  if (typeof closeBlankPage === 'function') closeBlankPage();
  if (hasUIController() && UIController.renderEmptyState) UIController.renderEmptyState();
  renderChatHistory();
}

document.addEventListener('click', closeHistoryMenus);
renderChatHistory();
