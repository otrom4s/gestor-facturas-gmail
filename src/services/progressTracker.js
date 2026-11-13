/**
 * In-memory progress tracker singleton for syncing and AI analysis.
 */
class ProgressTracker {
  constructor() {
    this.state = {
      active: false,
      title: '',
      step: '',
      current: 0,
      total: 0,
      percent: 0,
      timestamp: Date.now()
    };
  }

  start(title, total = 0) {
    this.state = {
      active: true,
      title,
      step: 'Iniciando...',
      current: 0,
      total,
      percent: 0,
      timestamp: Date.now()
    };
  }

  update({ current, total, step }) {
    if (total !== undefined) this.state.total = total;
    if (current !== undefined) this.state.current = current;
    if (step !== undefined) this.state.step = step;

    if (this.state.total > 0) {
      this.state.percent = Math.min(100, Math.round((this.state.current / this.state.total) * 100));
    } else {
      this.state.percent = 0;
    }
  }

  finish(message = 'Completado') {
    this.state.active = false;
    this.state.percent = 100;
    this.state.step = message;
  }

  getState() {
    return { ...this.state };
  }
}

module.exports = new ProgressTracker();
