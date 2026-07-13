// ===== Smart Home AI Console — Alpine.js App =====

const LOC = { bedroom:'卧室', livingroom:'客厅', kitchen:'厨房', study:'书房', balcony:'阳台', hallway:'走廊', dining:'餐厅', other:'房间' };
const TYPES = { air_conditioner:'空调', fan:'风扇', light:'灯', tv:'电视', other:'设备' };
const TYPE_SUFFIX = { air_conditioner:'ac', fan:'fan', light:'light', tv:'tv', other:'device' };
const ACTION_LABEL = { turn_on:'打开', turn_off:'关闭', set_temperature:'调温' };
const ACTION_LABEL_SMALL = { turn_on:'开关', turn_off:'开关', set_temperature:'调温' };

document.addEventListener('alpine:init', () => {
  Alpine.data('consoleApp', () => ({
    // ---- 状态 ----
    env: { temperature: '--', humidity: '--', time: '--:--', source: '' },
    sys: {
      aiClass: 'pill-warn', aiLabel: 'AI 检测中', backendClass: 'pill-offline', backendLabel: '后端未连接',
      hwClass: 'pill-warn', hwLabel: '硬件状态未知', refreshedAt: '', items: []
    },
    chat: {
      messages: [], input: '', thinking: false, loading: false, executing: false,
      reply: '', action: null, result: { show: false, ok: true, text: '' }
    },
    devices: {
      list: [], modalOpen: false, modalMode: 'add', modalEditingId: null,
      form: { type: 'air_conditioner', location: 'bedroom', name: '', id: 'bedroom_ac' }
    },
    learn: {
      deviceId: '', command: '', loading: false, result: null, codes: {}
    },
    toasts: [],
    error: '',
    lastActivity: '',
    settingsOpen: false,
    cfg: {
      llmEnabled: true, llmModel: '', llmApiKey: '', llmBaseUrl: '', llmTimeoutMs: 15000, llmMaxTokens: 1024,
      esp32Enabled: true, serialPort: '', serialBaudRate: 115200,
      msg: '', msgOk: true
    },

    // ---- 初始化 ----
    async init() {
      await Promise.all([this.fetchState(), this.loadConfig()]);
      await this.loadLearnedCodes();
      setInterval(() => this.fetchState(), 5000);
    },

    // ---- API ----
    async api(url, opts = {}) {
      try {
        const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        this.error = `请求失败: ${e.message}`;
        setTimeout(() => this.error = '', 6000);
        return null;
      }
    },

    async fetchState() {
      const data = await this.api('/api/state');
      if (!data) {
        this.sys.backendClass = 'pill-offline'; this.sys.backendLabel = '后端离线';
        return;
      }
      const st = data.system;
      // 环境
      if (data.environment) {
        this.env.temperature = data.environment.temperature;
        this.env.humidity = data.environment.humidity;
        this.env.time = data.environment.time;
        this.env.source = data.environment.source;
      }
      // 系统
      this.sys.backendClass = st.backendConnected ? 'pill-online' : 'pill-offline';
      this.sys.backendLabel = st.backendConnected ? '后端已连接' : '后端离线';
      const llm = st.llmStatus;
      if (!llm) { this.sys.aiClass = 'pill-warn'; this.sys.aiLabel = 'AI 检测中'; }
      else if (llm.reachable && !llm.authError) { this.sys.aiClass = 'pill-online'; this.sys.aiLabel = `AI 就绪 (${llm.model||'OK'})`; }
      else if (llm.reachable && llm.authError) { this.sys.aiClass = 'pill-offline'; this.sys.aiLabel = 'API Key 无效'; }
      else { this.sys.aiClass = 'pill-offline'; this.sys.aiLabel = llm.reason || 'AI 不可用'; }

      if (!st.esp32Configured) { this.sys.hwClass = 'pill-warn'; this.sys.hwLabel = '硬件未配置'; }
      else if (st.esp32Connected) { this.sys.hwClass = 'pill-online'; this.sys.hwLabel = '硬件在线'; }
      else { this.sys.hwClass = 'pill-offline'; this.sys.hwLabel = '硬件离线'; }

      this.sys.refreshedAt = new Date(st.refreshedAt).toLocaleTimeString('zh-CN', { hour12: false });
      this.sys.items = [
        { label: 'AI 模型', value: this._llmDetail(st) },
        { label: '后端连接', value: st.backendConnected ? '正常' : '异常' },
        { label: '硬件', value: this._hwDetail(st) },
        { label: '硬件细节', value: this._hwExtra(st) },
      ];
      // 设备
      this.devices.list = (data.devices || []).filter(d => d.paired);
    },

    // ---- 对话 ----
    async sendMessage() {
      const msg = this.chat.input.trim();
      if (!msg || this.chat.loading) return;
      this.chat.messages.push({ role: 'user', text: msg });
      this.chat.input = '';
      this.chat.reply = ''; this.chat.action = null; this.chat.result.show = false;
      this.chat.thinking = true; this.chat.loading = true;
      this.$nextTick(() => { const el = this.$refs.chatStream; if (el) el.scrollTop = el.scrollHeight; });

      const data = await this.api('/api/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
      this.chat.thinking = false; this.chat.loading = false;

      if (!data) {
        this.chat.messages.push({ role: 'assistant', text: '抱歉，AI 助手暂时无法响应。' });
        return;
      }

      if (data.needConfirm && data.action) {
        this.chat.reply = data.reply;
        this.chat.action = data.action;
      } else {
        this.chat.messages.push({ role: 'assistant', text: data.reply || '我暂时没有可展示的回复。' });
      }
      this.$nextTick(() => { const el = this.$refs.chatStream; if (el) el.scrollTop = el.scrollHeight; });
    },

    quickSend(msg) { this.chat.input = msg; this.sendMessage(); },

    async quickToggle(deviceId, command) {
      const data = await this.api('/api/execute', {
        method: 'POST', body: JSON.stringify({ deviceId, command })
      });
      if (!data) return;
      this.toast(data.success, data.message || (data.success ? '执行成功' : '执行失败'));
      this.lastActivity = `${this.deviceName(deviceId)} ${ACTION_LABEL[command] || command} · ${new Date().toLocaleTimeString('zh-CN',{hour12:false})}`;
      if (data.success) await this.fetchState();
    },

    async confirmExecute() {
      const a = this.chat.action;
      if (!a || this.chat.executing) return;
      this.chat.executing = true;
      const data = await this.api('/api/execute', {
        method: 'POST', body: JSON.stringify({ deviceId: a.deviceId, command: a.command, value: a.value })
      });
      this.chat.executing = false;
      if (!data) return;
      this.chat.result = { show: true, ok: data.success, text: data.message || (data.success ? '执行成功' : '执行失败') };
      this.chat.messages.push({ role: 'assistant', text: data.message || (data.success ? '已执行。' : '执行失败。') });
      this.lastActivity = `${this.actionLabel()} · ${new Date().toLocaleTimeString('zh-CN',{hour12:false})}`;
      this.chat.reply = ''; this.chat.action = null;
      if (data.success) await this.fetchState();
      setTimeout(() => this.chat.result.show = false, 4000);
    },

    actionLabel() {
      const a = this.chat.action;
      if (!a) return '';
      const dev = this.devices.list.find(d => d.id === a.deviceId);
      const name = dev ? dev.name : a.deviceId;
      if (a.command === 'set_temperature') return `${name} / 设置为 ${a.value}°C`;
      return `${name} / ${ACTION_LABEL[a.command] || a.command}`;
    },

    // ---- 设备管理 ----
    openDeviceModal(deviceId) {
      const dev = deviceId ? this.devices.list.find(d => d.id === deviceId) : null;
      this.devices.modalEditingId = deviceId;
      this.devices.modalMode = dev ? 'edit' : 'add';

      if (dev) {
        const locKey = Object.entries(LOC).find(([,v]) => v === dev.location)?.[0] || 'other';
        this.devices.form = { type: dev.type, location: locKey, name: dev.name, id: dev.id };
      } else {
        this.devices.form = { type: 'air_conditioner', location: 'bedroom', name: '', id: '' };
        this._genDeviceId();
      }
      this.devices.modalOpen = true;
    },

    onDeviceFormTypeChange() {
      if (this.devices.modalMode === 'edit') return;
      this._genDeviceId();
      if (!this.devices.form.name || this.devices.form._autoName) {
        this.devices.form.name = LOC[this.devices.form.location] + TYPES[this.devices.form.type];
        this.devices.form._autoName = true;
      }
    },

    onDeviceFormLocationChange() {
      if (this.devices.modalMode === 'edit') return;
      this._genDeviceId();
      if (this.devices.form._autoName !== false) {
        this.devices.form.name = LOC[this.devices.form.location] + TYPES[this.devices.form.type];
        this.devices.form._autoName = true;
      }
    },

    _genDeviceId() {
      if (this.devices.modalMode === 'edit') return;
      const loc = this.devices.form.location;
      const suf = TYPE_SUFFIX[this.devices.form.type] || 'device';
      let id = `${loc}_${suf}`;
      let n = 2;
      while (this.devices.list.some(d => d.id === id)) id = `${loc}_${suf}_${n++}`;
      this.devices.form.id = id;
    },

    async saveDevice() {
      const f = this.devices.form;
      if (!f.name.trim()) return;
      const isEdit = this.devices.modalMode === 'edit';
      const url = isEdit ? `/api/devices/${this.devices.modalEditingId}` : '/api/devices';
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit
        ? { name: f.name.trim(), location: LOC[f.location] || '', type: f.type }
        : { id: f.id, name: f.name.trim(), location: LOC[f.location] || '', type: f.type };

      const data = await this.api(url, { method, body: JSON.stringify(body) });
      if (data && data.success) {
        this.devices.modalOpen = false;
        await this.fetchState();
      }
    },

    async deleteDevice(deviceId) {
      if (!confirm(`确定删除「${this.deviceName(deviceId)}」？不可撤销。`)) return;
      const data = await this.api(`/api/devices/${deviceId}`, { method: 'DELETE' });
      if (data && data.success) await this.fetchState();
    },

    deviceName(id) {
      const dev = this.devices.list.find(d => d.id === id);
      return dev ? dev.name : id;
    },
    typeLabel(t) { return TYPES[t] || t; },
    actionLabelSmall(a) { return ACTION_LABEL_SMALL[a] || a; },

    // ---- 红外学习 ----
    learnCommands() {
      const dev = this.devices.list.find(d => d.id === this.learn.deviceId);
      return dev ? dev.actions || [] : [];
    },

    onLearnDeviceChange() {
      this.learn.command = '';
      this.learn.result = null;
    },

    async startLearning() {
      if (this.learn.loading || !this.learn.deviceId || !this.learn.command) return;
      this.learn.loading = true;
      this.learn.result = null;

      const data = await this.api('/api/ir-learn/start', { method: 'POST' });
      this.learn.loading = false;

      if (data && data.success) {
        this.learn.result = data.learned;
      } else {
        this.learn.result = null;
        this.toast(false, data?.message || '红外学习失败');
      }
    },

    async saveLearnedCode() {
      if (!this.learn.result) return;
      const data = await this.api('/api/ir-learn/save', {
        method: 'POST',
        body: JSON.stringify({ deviceId: this.learn.deviceId, command: this.learn.command, learned: this.learn.result })
      });
      if (data && data.success) {
        this.toast(true, `已保存 ${this.deviceName(this.learn.deviceId)} / ${this.actionLabelSmall(this.learn.command)}`);
        this.learn.result = null;
        this.learn.command = '';
        await this.loadLearnedCodes();
        await this.fetchState();
      }
    },

    async loadLearnedCodes() {
      const data = await this.api('/api/ir-learn/codes');
      if (data) this.learn.codes = data;
    },

    async deleteLearnedCode(deviceId, command) {
      const data = await this.api('/api/ir-learn/codes', {
        method: 'DELETE', body: JSON.stringify({ deviceId, command })
      });
      if (data && data.success) {
        await this.loadLearnedCodes();
        await this.fetchState();
      }
    },

    // ---- Toast ----
    _nextToastId: 1,
    toast(ok, text) {
      const id = this._nextToastId++;
      this.toasts.push({ _id: id, show: true, ok, text });
      setTimeout(() => {
        const t = this.toasts.find(t2 => t2._id === id);
        if (t) t.show = false;
        setTimeout(() => {
          this.toasts = this.toasts.filter(t2 => t2.show);
        }, 400);
      }, 3000);
    },

    // ---- 格式化 ----
    fmtTemp() {
      const v = this.env.temperature;
      if (typeof v !== 'number') return '--°C';
      return Number.isInteger(v) ? `${v}°C` : `${v.toFixed(1)}°C`;
    },
    fmtHumidity() {
      const v = this.env.humidity;
      if (typeof v !== 'number') return '--%';
      return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
    },

    // ---- 配置 ----
    async loadConfig() {
      const data = await this.api('/api/config');
      if (!data) return;
      this.cfg.llmEnabled = data.llmEnabled;
      this.cfg.llmModel = data.llmModel;
      this.cfg.llmBaseUrl = data.llmBaseUrl;
      this.cfg.llmTimeoutMs = data.llmTimeoutMs;
      this.cfg.llmMaxTokens = data.llmMaxTokens;
      this.cfg.esp32Enabled = data.esp32Enabled;
      this.cfg.serialPort = data.serialPort;
      this.cfg.serialBaudRate = data.serialBaudRate;
    },
    async saveConfig() {
      const body = {
        llmEnabled: this.cfg.llmEnabled,
        llmModel: this.cfg.llmModel,
        llmBaseUrl: this.cfg.llmBaseUrl,
        llmTimeoutMs: Number(this.cfg.llmTimeoutMs),
        llmMaxTokens: Number(this.cfg.llmMaxTokens),
        esp32Enabled: this.cfg.esp32Enabled,
        serialPort: this.cfg.serialPort,
        serialBaudRate: Number(this.cfg.serialBaudRate)
      };
      if (this.cfg.llmApiKey) body.llmApiKey = this.cfg.llmApiKey;
      const data = await this.api('/api/config', { method: 'POST', body: JSON.stringify(body) });
      if (data?.success) {
        this.cfg.msg = '配置已保存，立即生效。';
        this.cfg.msgOk = true;
        this.cfg.llmApiKey = '';
        await this.fetchState();
      } else {
        this.cfg.msg = data?.message || '保存失败';
        this.cfg.msgOk = false;
      }
      setTimeout(() => this.cfg.msg = '', 4000);
    },

    // ---- 系统详情辅助 ----
    _llmDetail(st) {
      if (!st.aiDecisionEnabled) return '未启用';
      const s = st.llmStatus;
      if (!s) return '检测中…';
      if (s.reachable && !s.authError) return `已连接 (${s.model||'OK'})`;
      if (s.reachable && s.authError) return 'API Key 无效';
      return s.reason || '无法连接';
    },
    _hwDetail(st) {
      if (!st.esp32Configured) return '未配置';
      if (!st.esp32Connected || !st.esp32) return '离线';
      const c = st.esp32Connection;
      return `在线 · ${c.serialPath||''} ${c.baudRate||''}bps`;
    },
    _hwExtra(st) {
      if (!st.esp32Configured) return '未启用硬件桥接';
      if (!st.esp32Connected || !st.esp32) return '未获取到健康状态';
      const parts = [];
      if (st.esp32.serviceStarted) parts.push('IR API 已启动');
      if (st.esp32.sensorReady) parts.push('DHT22 就绪');
      if (st.esp32.wifiConnected) parts.push('Wi-Fi 正常');
      if (st.esp32.hostname) parts.push(st.esp32.hostname);
      return parts.length > 0 ? parts.join(' / ') : '已连接';
    },
  }));
});
