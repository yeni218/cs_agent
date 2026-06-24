const state = {
  orders: [],
  filter: 'all',
  token: getToken(),
  agent: {
    sessionId: getAgentSessionId(),
    socket: null,
    audioContext: null,
    micStream: null,
    processor: null,
    source: null,
    silenceGain: null,
    playbackSource: null,
    currentAudioBase64: '',
    currentAudioDuration: 0,
    playbackStartedAt: 0,
    pausedAudioBase64: '',
    pausedAudioOffset: 0,
    lastAssistantText: '',
    listening: false,
    busy: false,
    greeted: false,
    playing: false,
    interruptedAt: 0
  }
};

const labels = {
  building: 'Oluşturuluyor',
  confirmed: 'Onaylandı',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
  completed: 'Tamamlandı',
  cancelled: 'İptal'
};

const nextActions = {
  confirmed: [{ status: 'preparing', label: 'Hazırla' }],
  preparing: [{ status: 'ready', label: 'Hazır' }],
  ready: [{ status: 'completed', label: 'Tamamla' }]
};

document.getElementById('filters').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  document.querySelectorAll('#filters button').forEach((candidate) => {
    candidate.classList.toggle('active', candidate === button);
  });
  state.filter = button.dataset.filter;
  render();
});

connectEvents();
initAgentWidget();

function connectEvents() {
  const url = state.token
    ? `/api/orders/stream?token=${encodeURIComponent(state.token)}`
    : '/api/orders/stream';
  const source = new EventSource(url);

  source.onopen = () => setConnection(true);
  source.onerror = () => setConnection(false);
  source.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    handleEvent(payload);
  };
}

function handleEvent(payload) {
  if (payload.type === 'init') {
    state.orders = payload.orders || [];
  } else if (payload.order) {
    upsertOrder(payload.order);
    if (payload.type === 'order:created') toast(`Yeni sipariş #${payload.order.id}`);
    if (payload.type === 'order:confirmed') toast(`#${payload.order.id} onaylandı`);
  }
  render();
}

function upsertOrder(order) {
  const index = state.orders.findIndex((candidate) => candidate.id === order.id);
  if (index >= 0) state.orders[index] = order;
  else state.orders.unshift(order);
}

function render() {
  renderStats();
  const root = document.getElementById('orders');
  root.replaceChildren();

  const filtered = state.filter === 'all'
    ? state.orders
    : state.orders.filter((order) => order.status === state.filter);

  if (filtered.length === 0) {
    root.append(el('div', { className: 'empty' }, 'Henüz sipariş yok'));
    return;
  }

  for (const order of filtered) root.append(renderOrder(order));
}

function renderOrder(order) {
  const card = el('article', { className: 'order-card' });
  const status = el('span', { className: `badge ${order.status}` }, labels[order.status] || order.status);

  card.append(
    el('div', { className: 'order-head' },
      el('div', {},
        el('div', { className: 'order-id' }, `#${order.id}`),
        el('div', { className: 'order-time' }, formatTime(order.createdAt))
      ),
      status
    )
  );

  const items = el('div', { className: 'order-items' });
  if (order.items.length === 0) {
    items.append(el('p', { className: 'notes' }, 'Sipariş oluşturuluyor...'));
  } else {
    for (const item of order.items) {
      items.append(
        el('div', { className: 'item' },
          el('div', {},
            el('div', {},
              el('span', { className: 'qty' }, String(item.quantity)),
              document.createTextNode(item.name)
            ),
            item.notes ? el('div', { className: 'notes' }, item.notes) : null
          ),
          el('strong', {}, `${item.price * item.quantity} TL`)
        )
      );
    }
  }
  card.append(items);

  const actions = el('div', { className: 'actions' });
  for (const action of nextActions[order.status] || []) {
    const button = el('button', { className: 'action', type: 'button' }, action.label);
    button.addEventListener('click', () => updateStatus(order.id, action.status));
    actions.append(button);
  }

  card.append(
    el('div', { className: 'order-foot' },
      el('span', { className: 'total' }, `${order.total} TL`),
      actions
    )
  );

  return card;
}

function renderStats() {
  const active = state.orders.filter((order) => ['building', 'confirmed', 'preparing', 'ready'].includes(order.status));
  const completed = state.orders.filter((order) => order.status === 'completed');
  const revenue = state.orders
    .filter((order) => ['confirmed', 'preparing', 'ready', 'completed'].includes(order.status))
    .reduce((sum, order) => sum + order.total, 0);

  setText('statTotal', state.orders.length);
  setText('statActive', active.length);
  setText('statCompleted', completed.length);
  setText('statRevenue', `${revenue.toLocaleString('tr-TR')} TL`);
}

async function updateStatus(orderId, status) {
  const response = await fetch(`/api/orders/${orderId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
    },
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    toast(payload.error || 'Durum güncellenemedi');
  }
}

function setConnection(online) {
  const node = document.getElementById('connectionStatus');
  node.classList.toggle('offline', !online);
  node.lastElementChild.textContent = online ? 'Canlı bağlantı' : 'Bağlantı yok';
}

function toast(message) {
  const box = el('div', { className: 'toast' }, message);
  document.getElementById('toasts').append(box);
  setTimeout(() => box.remove(), 3500);
}

function initAgentWidget() {
  const launcher = document.getElementById('agentLauncher');
  const panel = document.getElementById('agentPanel');
  const close = document.getElementById('agentClose');
  const mic = document.getElementById('agentMic');
  const input = document.getElementById('agentInput');
  const send = document.getElementById('agentSend');

  launcher.addEventListener('click', () => {
    panel.hidden = false;
    launcher.classList.add('active');
    connectRealtimeAgent();
  });

  close.addEventListener('click', () => {
    stopRealtimeAgent();
    panel.hidden = true;
    launcher.classList.remove('active');
  });

  mic.addEventListener('click', () => {
    if (state.agent.listening) stopMicrophone();
    else startMicrophone();
  });

  send.addEventListener('click', () => sendTypedAgentMessage());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendTypedAgentMessage();
  });
}

function sendTypedAgentMessage() {
  const input = document.getElementById('agentInput');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  sendAgentText(message);
}

function connectRealtimeAgent() {
  if (state.agent.socket && state.agent.socket.readyState <= WebSocket.OPEN) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ sessionId: state.agent.sessionId });
  if (state.token) params.set('token', state.token);

  const socket = new WebSocket(`${protocol}//${window.location.host}/api/agent/realtime?${params}`);
  state.agent.socket = socket;
  setAgentStatus('Bağlanıyor');

  socket.onopen = () => {
    setAgentStatus('Bağlandı');
    startMicrophone();
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleRealtimeAgentMessage(message);
  };

  socket.onerror = () => {
    setAgentStatus('Bağlantı hatası');
    appendAgentMessage('error', 'Agent bağlantısı kurulamadı.');
  };

  socket.onclose = () => {
    state.agent.socket = null;
    setAgentStatus('Bağlantı kapandı');
    stopMicrophone();
  };
}

function handleRealtimeAgentMessage(message) {
  switch (message.type) {
    case 'ready':
      if (!state.agent.greeted) {
        state.agent.greeted = true;
        appendAgentMessage('assistant', message.greeting);
      }
      setAgentStatus('Dinliyorum');
      break;

    case 'speech_start':
    case 'interrupted':
      pauseAssistantAudio();
      setAgentStatus('Dinliyorum');
      break;

    case 'false_interrupt':
      resumeAssistantAudio();
      break;

    case 'transcript':
      appendAgentMessage('user', message.text);
      setAgentStatus('Düşünüyor');
      break;

    case 'assistant_text':
      state.agent.lastAssistantText = message.text || '';
      appendAgentMessage('assistant', message.text || 'Tamam.');
      setAgentStatus(message.orderId ? `Sipariş #${message.orderId}` : 'Konuşuyor');
      break;

    case 'assistant_audio':
      playMulawAudio(message.audio);
      break;

    case 'tts_unavailable':
      if (state.agent.lastAssistantText) {
        speakBrowserFallback(state.agent.lastAssistantText);
        setAgentStatus('Tarayıcı sesi');
      } else {
        appendAgentMessage('error', message.error || 'Ses üretilemedi.');
      }
      break;

    case 'status':
      setAgentStatus(statusLabel(message.status));
      break;

    case 'error':
      appendAgentMessage('error', message.error || 'Agent hatası.');
      setAgentStatus('Hata');
      break;
  }
}

async function startMicrophone() {
  if (state.agent.listening) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    setAgentStatus('Mikrofon desteklenmiyor');
    document.getElementById('agentInput').focus();
    return;
  }

  try {
    const audioContext = new AudioContext({ sampleRate: 48000 });
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });
    const source = audioContext.createMediaStreamSource(micStream);
    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    const silenceGain = audioContext.createGain();
    silenceGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const socket = state.agent.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      const input = event.inputBuffer.getChannelData(0);
      const rms = calculateRms(input);
      if (state.agent.playing && rms > 0.035 && Date.now() - state.agent.interruptedAt > 450) {
        state.agent.interruptedAt = Date.now();
        pauseAssistantAudio();
        socket.send(JSON.stringify({ type: 'interrupt' }));
      }

      const pcm16 = downsampleToPcm16(input, audioContext.sampleRate, 8000);
      if (pcm16.byteLength > 0) {
        socket.send(JSON.stringify({
          type: 'audio',
          audio: arrayBufferToBase64(pcm16.buffer)
        }));
      }
    };

    source.connect(processor);
    processor.connect(silenceGain);
    silenceGain.connect(audioContext.destination);

    Object.assign(state.agent, {
      audioContext,
      micStream,
      processor,
      source,
      silenceGain,
      listening: true
    });
    document.getElementById('agentMic').classList.add('listening');
    setAgentStatus('Dinliyorum');
  } catch (error) {
    appendAgentMessage('error', 'Mikrofon izni alınamadı.');
    setAgentStatus('Mikrofon kapalı');
  }
}

function stopMicrophone() {
  const agent = state.agent;
  agent.processor?.disconnect();
  agent.source?.disconnect();
  agent.silenceGain?.disconnect();
  agent.micStream?.getTracks().forEach((track) => track.stop());
  agent.audioContext?.close();

  Object.assign(agent, {
    audioContext: null,
    micStream: null,
    processor: null,
    source: null,
    silenceGain: null,
    listening: false
  });
  document.getElementById('agentMic').classList.remove('listening');
  setAgentStatus('Mikrofon kapalı');
}

function stopRealtimeAgent() {
  stopAssistantAudio();
  stopMicrophone();
  state.agent.socket?.close();
  state.agent.socket = null;
}

function sendAgentText(message) {
  appendAgentMessage('user', message);
  if (!state.agent.socket || state.agent.socket.readyState !== WebSocket.OPEN) {
    connectRealtimeAgent();
    setTimeout(() => sendAgentText(message), 250);
    return;
  }
  stopAssistantAudio();
  state.agent.socket.send(JSON.stringify({ type: 'text', text: message }));
  setAgentStatus('Düşünüyor');
}

function appendAgentMessage(role, message) {
  const root = document.getElementById('agentMessages');
  root.append(el('div', { className: `agent-message ${role}` }, message));
  root.scrollTop = root.scrollHeight;
}

function playMulawAudio(base64Audio, offsetSeconds = 0) {
  if (!base64Audio) return;
  stopAssistantAudio();

  const pcm = decodeMulawBase64(base64Audio);
  const audioContext = state.agent.audioContext || new AudioContext({ sampleRate: 8000 });
  state.agent.audioContext = audioContext;

  const buffer = audioContext.createBuffer(1, pcm.length, 8000);
  buffer.copyToChannel(pcm, 0);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.onended = () => {
    if (state.agent.playbackSource === source) {
      state.agent.playbackSource = null;
      state.agent.playing = false;
      state.agent.currentAudioBase64 = '';
      state.agent.currentAudioDuration = 0;
      state.agent.playbackStartedAt = 0;
      setAgentStatus(state.agent.listening ? 'Dinliyorum' : 'Hazır');
    }
  };

  const startOffset = Math.min(Math.max(0, offsetSeconds), Math.max(0, buffer.duration - 0.05));
  state.agent.playbackSource = source;
  state.agent.currentAudioBase64 = base64Audio;
  state.agent.currentAudioDuration = buffer.duration;
  state.agent.playbackStartedAt = audioContext.currentTime - startOffset;
  state.agent.pausedAudioBase64 = '';
  state.agent.pausedAudioOffset = 0;
  state.agent.playing = true;
  source.start(0, startOffset);
}

function pauseAssistantAudio() {
  const agent = state.agent;
  const source = agent.playbackSource;
  if (!source) {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    agent.playing = false;
    return;
  }

  const currentTime = agent.audioContext?.currentTime || 0;
  const elapsed = Math.max(0, currentTime - agent.playbackStartedAt);
  const remaining = Math.max(0, agent.currentAudioDuration - elapsed);
  const canResume = agent.currentAudioBase64 && remaining > 0.25;

  if (canResume) {
    agent.pausedAudioBase64 = agent.currentAudioBase64;
    agent.pausedAudioOffset = Math.min(elapsed, agent.currentAudioDuration);
  }

  stopAssistantAudio({ preservePaused: canResume });
}

function resumeAssistantAudio() {
  const { pausedAudioBase64, pausedAudioOffset } = state.agent;
  if (!pausedAudioBase64) {
    setAgentStatus(state.agent.listening ? 'Dinliyorum' : 'Hazır');
    return;
  }

  playMulawAudio(pausedAudioBase64, pausedAudioOffset);
  setAgentStatus('Konuşuyor');
}

function stopAssistantAudio({ preservePaused = false } = {}) {
  const source = state.agent.playbackSource;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (source) {
    source.onended = null;
    try {
      source.stop();
    } catch {}
  }
  state.agent.playbackSource = null;
  state.agent.playing = false;
  state.agent.currentAudioBase64 = '';
  state.agent.currentAudioDuration = 0;
  state.agent.playbackStartedAt = 0;
  if (!preservePaused) {
    state.agent.pausedAudioBase64 = '';
    state.agent.pausedAudioOffset = 0;
  }
}

function speakBrowserFallback(text) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'tr-TR';
  utterance.onstart = () => {
    state.agent.playing = true;
  };
  utterance.onend = () => {
    state.agent.playing = false;
    setAgentStatus(state.agent.listening ? 'Dinliyorum' : 'Hazır');
  };
  window.speechSynthesis.speak(utterance);
}

function setAgentStatus(text) {
  document.getElementById('agentStatus').textContent = text;
}

function statusLabel(status) {
  return {
    listening: 'Dinliyorum',
    transcribing: 'Anlıyorum',
    thinking: 'Düşünüyor',
    speaking: 'Konuşuyor'
  }[status] || 'Hazır';
}

function downsampleToPcm16(input, inputRate, outputRate) {
  if (outputRate === inputRate) return floatToPcm16(input);

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    const sample = sum / Math.max(1, end - start);
    output[i] = clampPcm16(sample);
  }

  return output;
}

function floatToPcm16(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) output[i] = clampPcm16(input[i]);
  return output;
}

function clampPcm16(sample) {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

function calculateRms(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeMulawBase64(base64Audio) {
  const binary = atob(base64Audio);
  const output = new Float32Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = mulawDecode(binary.charCodeAt(i)) / 32768;
  }
  return output;
}

function mulawDecode(byte) {
  const mulaw = ~byte & 0xff;
  const sign = mulaw & 0x80 ? -1 : 1;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0f;
  let magnitude = ((mantissa << 1) + 33) << (exponent + 2);
  magnitude -= 33 * 4;
  return sign * magnitude;
}

function setText(id, value) {
  document.getElementById(id).textContent = String(value);
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function getToken() {
  const queryToken = new URLSearchParams(window.location.search).get('token');
  if (queryToken) localStorage.setItem('afiyet_api_token', queryToken);
  return queryToken || localStorage.getItem('afiyet_api_token') || '';
}

function getAgentSessionId() {
  const existing = localStorage.getItem('afiyet_agent_session_id');
  if (existing) return existing;
  const id = window.crypto?.randomUUID?.() || `browser-${Date.now()}`;
  localStorage.setItem('afiyet_agent_session_id', id);
  return id;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
