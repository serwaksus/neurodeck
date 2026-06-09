var ND = window.ND || {};

(function() {

  var MAX_PARTICLES = ND.CONST.MAX_PARTICLES;
  var pool = [];
  var activeIndices = [];
  var i;

  function Particle() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 0;
    this.size = 2;
    this.color = '#fff';
    this.shape = 'circle';
    this.gravity = 0;
    this.friction = 1;
    this.active = false;
  }

  Particle.prototype.reset = function(x, y, options) {
    this.x = x;
    this.y = y;
    this.vx = (options && options.vx != null) ? options.vx : 0;
    this.vy = (options && options.vy != null) ? options.vy : 0;
    this.life = (options && options.life != null) ? options.life : 60;
    this.maxLife = this.life;
    this.size = (options && options.size != null) ? options.size : 2;
    this.color = (options && options.color) || '#fff';
    this.shape = (options && options.shape) || 'circle';
    this.gravity = (options && options.gravity != null) ? options.gravity : 0;
    this.friction = (options && options.friction != null) ? options.friction : 1;
    this.active = true;
  };

  Particle.prototype.update = function() {
    if (!this.active) return;
    this.vy += this.gravity;
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    if (this.life <= 0) {
      this.active = false;
    }
  };

  Particle.prototype.draw = function(ctx) {
    if (!this.active) return;
    var alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    if (this.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.shape === 'square') {
      ctx.fillRect(this.x - this.size, this.y - this.size, this.size * 2, this.size * 2);
    } else if (this.shape === 'line') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = Math.max(1, this.size * 0.5);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.vx * 2, this.y + this.vy * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  for (i = 0; i < MAX_PARTICLES; i++) {
    pool.push(new Particle());
  }

  var particlePool = {
    acquire: function(x, y, options) {
      for (var j = 0; j < pool.length; j++) {
        if (!pool[j].active) {
          pool[j].reset(x, y, options);
          activeIndices.push(j);
          return pool[j];
        }
      }
      return null;
    },
    release: function(particle) {
      particle.active = false;
      particle.life = 0;
    },
    update: function() {
      var k = 0;
      for (var j = 0; j < activeIndices.length; j++) {
        var idx = activeIndices[j];
        var p = pool[idx];
        if (p.active) {
          p.update();
          if (p.active) {
            activeIndices[k] = idx;
            k++;
          }
        }
      }
      activeIndices.length = k;
    },
    draw: function(ctx) {
      for (var j = 0; j < activeIndices.length; j++) {
        pool[activeIndices[j]].draw(ctx);
      }
    },
    getActiveCount: function() {
      return activeIndices.length;
    }
  };

  ND.particlePool = particlePool;

  var shakeIntensity = 0;
  var shakeDuration = 0;
  var shakeOffsetX = 0;
  var shakeOffsetY = 0;

  ND.screenShake = function(intensity, duration) {
    shakeIntensity = intensity;
    shakeDuration = duration;
  };

  ND.updateScreenShake = function() {
    if (shakeDuration > 0) {
      shakeOffsetX = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeOffsetY = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeDuration--;
      if (shakeDuration <= 0) {
        shakeIntensity = 0;
        shakeOffsetX = 0;
        shakeOffsetY = 0;
      }
    }
  };

  ND.getShakeOffset = function() {
    return { x: shakeOffsetX, y: shakeOffsetY };
  };

  var toastQueue = [];
  var toastActive = false;
  var toastContainer = null;

  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'nd-toast-container';
      toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;pointer-events:none;';
      document.body.appendChild(toastContainer);
    }
  }

  function showToastFromQueue() {
    if (toastActive || toastQueue.length === 0) return;
    toastActive = true;
    var item = toastQueue.shift();
    ensureToastContainer();

    var el = document.createElement('div');
    el.style.cssText = 'background:#222;color:#fff;padding:12px 20px;border-radius:6px;margin-bottom:8px;font-size:14px;font-family:sans-serif;pointer-events:auto;opacity:0;transition:opacity 0.3s;max-width:320px;border-left:4px solid ' + getToastBorderColor(item.type) + ';';

    var titleHtml = ND.esc(item.title);
    var bodyHtml = ND.esc(item.body);
    el.innerHTML = '<strong>' + titleHtml + '</strong>' + (bodyHtml ? '<br><span style="font-size:12px;opacity:0.8;">' + bodyHtml + '</span>' : '');

    if (item.undoFn) {
      var undoBtn = document.createElement('button');
      undoBtn.textContent = 'Undo';
      undoBtn.style.cssText = 'margin-left:10px;background:#555;color:#fff;border:none;padding:2px 10px;border-radius:3px;cursor:pointer;font-size:12px;';
      var undone = false;
      undoBtn.onclick = function() {
        undone = true;
        if (item.undoFn) item.undoFn();
        dismissToast(el);
      };
      el.appendChild(undoBtn);
      item._undone = function() { return undone; };
    }

    toastContainer.appendChild(el);
    setTimeout(function() { el.style.opacity = '1'; }, 10);

    var duration = item.duration || 3000;
    setTimeout(function() {
      if (item._undone && item._undone()) return;
      dismissToast(el);
    }, duration);
  }

  function dismissToast(el) {
    el.style.opacity = '0';
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
      toastActive = false;
      showToastFromQueue();
    }, 300);
  }

  function getToastBorderColor(type) {
    if (type === 'success') return '#4caf50';
    if (type === 'error') return '#f44336';
    if (type === 'warning') return '#ff9800';
    if (type === 'info') return '#2196f3';
    return '#888';
  }

  ND.showToast = function(title, body, type) {
    toastQueue.push({ title: title, body: body, type: type || 'info' });
    showToastFromQueue();
  };

  ND.showUndoToast = function(title, body, undoFn) {
    toastQueue.push({ title: title, body: body, type: 'warning', undoFn: undoFn });
    showToastFromQueue();
  };

  var spiritQueue = [];
  var spiritActive = false;
  var spiritContainer = null;

  function ensureSpiritContainer() {
    if (!spiritContainer) {
      spiritContainer = document.createElement('div');
      spiritContainer.id = 'nd-spirit-container';
      spiritContainer.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;text-align:center;';
      document.body.appendChild(spiritContainer);
    }
  }

  function showSpiritFromQueue() {
    if (spiritActive || spiritQueue.length === 0) return;
    spiritActive = true;
    var text = spiritQueue.shift();
    ensureSpiritContainer();

    var el = document.createElement('div');
    el.style.cssText = 'color:#e0d8f0;font-size:20px;font-family:Georgia,serif;font-style:italic;text-shadow:0 0 10px rgba(180,160,220,0.6);opacity:0;transition:opacity 0.5s;max-width:400px;padding:20px;';
    el.textContent = text;

    spiritContainer.appendChild(el);
    setTimeout(function() { el.style.opacity = '1'; }, 10);

    setTimeout(function() {
      el.style.opacity = '0';
      setTimeout(function() {
        if (el.parentNode) el.parentNode.removeChild(el);
        spiritActive = false;
        showSpiritFromQueue();
      }, 500);
    }, 4000);
  }

  ND.spiritSay = function(text) {
    spiritQueue.push(text);
    showSpiritFromQueue();
  };

  var dustParticles = [];
  var DUST_COUNT = 60;
  var dustCanvas = null;
  var dustCtx = null;

  function initDust() {
    dustCanvas = document.createElement('canvas');
    dustCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    document.body.appendChild(dustCanvas);
    dustCtx = dustCanvas.getContext('2d');
    resizeDustCanvas();
    window.addEventListener('resize', resizeDustCanvas);

    for (var j = 0; j < DUST_COUNT; j++) {
      dustParticles.push({
        x: Math.random() * dustCanvas.width,
        y: Math.random() * dustCanvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.5 - 0.1,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.3 + 0.05,
        baseAlpha: 0
      });
      dustParticles[j].baseAlpha = dustParticles[j].alpha;
    }
  }

  function resizeDustCanvas() {
    if (!dustCanvas) return;
    dustCanvas.width = window.innerWidth;
    dustCanvas.height = window.innerHeight;
  }

  ND.updateDust = function() {
    if (!dustCtx) return;
    var w = dustCanvas.width;
    var h = dustCanvas.height;
    dustCtx.clearRect(0, 0, w, h);

    for (var j = 0; j < dustParticles.length; j++) {
      var d = dustParticles[j];
      d.x += d.vx;
      d.y += d.vy;
      d.alpha = d.baseAlpha + Math.sin(Date.now() * 0.001 + j) * 0.05;

      if (d.y < -10) {
        d.y = h + 10;
        d.x = Math.random() * w;
      }
      if (d.x < -10) d.x = w + 10;
      if (d.x > w + 10) d.x = -10;

      dustCtx.globalAlpha = Math.max(0, d.alpha);
      dustCtx.fillStyle = '#a898c8';
      dustCtx.beginPath();
      dustCtx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      dustCtx.fill();
    }
    dustCtx.globalAlpha = 1;
  };

  ND.initDust = initDust;

  ND.spawnBloodRain = function(count) {
    count = count || 30;
    for (var j = 0; j < count; j++) {
      particlePool.acquire(
        Math.random() * window.innerWidth,
        -10,
        {
          vx: (Math.random() - 0.5) * 1,
          vy: Math.random() * 4 + 3,
          life: 80 + Math.random() * 40,
          size: Math.random() * 2 + 1,
          color: '#8b0000',
          shape: 'circle',
          gravity: 0.1,
          friction: 0.99
        }
      );
    }
  };

  var floatNumbers = [];
  var floatContainer = null;

  function ensureFloatContainer() {
    if (!floatContainer) {
      floatContainer = document.createElement('div');
      floatContainer.id = 'nd-float-container';
      floatContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
      document.body.appendChild(floatContainer);
    }
  }

  ND.spawnFloatNumber = function(x, y, value, color) {
    ensureFloatContainer();
    var el = document.createElement('div');
    var displayValue = (value > 0 ? '+' : '') + value;
    el.textContent = displayValue;
    var c = color || (value > 0 ? '#4caf50' : '#f44336');
    el.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;color:' + c + ';font-size:18px;font-weight:bold;font-family:sans-serif;pointer-events:none;transition:transform 1s ease-out,opacity 1s ease-out;opacity:1;';
    floatContainer.appendChild(el);

    setTimeout(function() {
      el.style.transform = 'translateY(-60px)';
      el.style.opacity = '0';
    }, 10);

    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1100);
  };

  ND.updateParticles = function() {
    particlePool.update();
  };

  ND.drawParticles = function(ctx) {
    particlePool.draw(ctx);
  };

})();

window.ND = ND;
