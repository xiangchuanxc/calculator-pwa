/**
 * StorageManager — localStorage 读写封装
 * 处理 localStorage 不可用、JSON 解析失败、QuotaExceededError 三种异常情况
 */

const SESSIONS_KEY = 'pwa_sessions';
const THEME_KEY = 'pwa_theme';

const StorageManager = {
  /**
   * 读取所有历史 Session，按 savedAt 倒序返回
   * @returns {Session[]}
   */
  getSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      if (raw === null) return [];
      try {
        const sessions = JSON.parse(raw);
        if (!Array.isArray(sessions)) {
          // 数据格式损坏，重置
          localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
          return [];
        }
        // 按 savedAt 倒序排列
        return sessions.slice().sort((a, b) => b.savedAt - a.savedAt);
      } catch {
        // JSON 解析失败，清空并重置
        localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
        return [];
      }
    } catch {
      // localStorage 不可用
      return [];
    }
  },

  /**
   * 保存一条新 Session（追加到数组并写回）
   * @param {Session} session
   */
  saveSession(session) {
    try {
      const sessions = this.getSessions();
      sessions.push(session);
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
          throw new Error('存储空间已满，请删除旧记录后再保存');
        }
        throw e;
      }
    } catch (e) {
      // 如果是我们自己抛出的带提示信息的错误，继续向上抛
      if (e.message && e.message.includes('存储空间已满')) {
        throw e;
      }
      // localStorage 不可用等其他错误，静默处理
    }
  },

  /**
   * 删除指定 id 的 Session
   * @param {string} id
   */
  deleteSession(id) {
    try {
      const sessions = this.getSessions();
      const filtered = sessions.filter(s => s.id !== id);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered));
    } catch {
      // localStorage 不可用，静默处理
    }
  },

  /**
   * 读取主题偏好，默认返回 'dark'
   * @returns {'dark' | 'light'}
   */
  getTheme() {
    try {
      const theme = localStorage.getItem(THEME_KEY);
      if (theme === 'light') return 'light';
      return 'dark';
    } catch {
      return 'dark';
    }
  },

  /**
   * 保存主题偏好
   * @param {'dark' | 'light'} theme
   */
  saveTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // localStorage 不可用，静默处理
    }
  },
};

export default StorageManager;
