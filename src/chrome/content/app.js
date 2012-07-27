// Author: Matija Podravec, 2012.

if (!mpagespace.app) mpagespace.app = {};
else if (typeof mpagespace.app != 'object')
  throw new Error('mpagespace.app already exists and is not an object');

mpagespace.app = {
  observer: {
    observe: function(subject, topic, data) {  
      var self = mpagespace.app;
      if (topic == 'mpage-model') {
        mpagespace.dump('app.observe: ' + topic + '/' + data);
        switch (data) {
          case 'model-reset':
          case 'model-loaded':
          case 'page-deleted':
          case 'page-added':
          case 'page-renamed':
          case 'page-reordered':
            self.populatePageTreeMenu();
          default:
            mpagespace.dump('app.observe: Event ignored!');
            break;
        }
      }  
    }
  },

  init: function() {
    var self = mpagespace.app;
    self.firstRun(); 
    mpagespace.observerService.addObserver(self.observer, 'mpage-model', false); 
    mpagespace.fuelApplication.storage.set('mpage-model', new mpagespace.model()); 

    var timer = Components.classes["@mozilla.org/timer;1"]
      .createInstance(Components.interfaces.nsITimer);
    var timerCallback = {
      notify: function() {
        var model = self.getModel();
        if (model.isDirty()) {
          model.commit();
        }
      }
    };
    timer.initWithCallback(timerCallback, 10*60*1000, timer.TYPE_REPEATING_SLACK);
  },

  close: function() {
    mpagespace.observerService.removeObserver(mpagespace.app.observer, 'mpage-model');
    var model = mpagespace.app.getModel();
    if (model.isDirty()) {
      model.commit();
    }
  },

  openPage: function(pageId) {
    var url = 'chrome://mpagespace/content/main.xul';
    var wm = mpagespace.windowMediator;
    var browserEnumerator = wm.getEnumerator("navigator:browser");  
    var found = false;

    while (!found && browserEnumerator.hasMoreElements()) {  
      var browserWin = browserEnumerator.getNext();  
      var tabbrowser = browserWin.gBrowser;  
      var numTabs = tabbrowser.browsers.length;  
      for (var index = 0; index < numTabs; index++) {  
        var currentBrowser = tabbrowser.getBrowserAtIndex(index);  
        if (currentBrowser.currentURI.spec == url) {  
          tabbrowser.selectedTab = tabbrowser.tabContainer.childNodes[index];  
          browserWin.focus();  
          found = true;
          break;  
        }  
      }  
    }  
    if (!found) {
      openUILinkIn(url, 'tab');
    }

    mpagespace.app.getModel().changeActivePage(pageId);
    mpagespace.app.checkToolbarVisibility();
  },

  getModel: function() {
    return mpagespace.fuelApplication.storage.get('mpage-model', null);
  },

  getTheme: function() {
    return mpagespace.fuelApplication.prefs.getValue('extensions.mpagespace.theme', 'kellys');
  },

  setTheme: function(value, customCssFile) {
    mpagespace.fuelApplication.prefs.setValue('extensions.mpagespace.theme', value);
    mpagespace.app.setCustomCssFile(value != 'custom' ? '' : customCssFile);
    mpagespace.observerService.notifyObservers(null, 'mpage-app', 'theme-changed');  
  },

  getFaviconFlag: function() {
    return mpagespace.fuelApplication.prefs.getValue('extensions.mpagespace.faviconflag', true);
  },

  setFaviconFlag: function(value) {
    mpagespace.fuelApplication.prefs.setValue('extensions.mpagespace.faviconflag', value == true);
    mpagespace.observerService.notifyObservers(null, 'mpage-app', 'faviconflag-changed');  
  },

  getCustomCssFile: function() {
    return mpagespace.fuelApplication.prefs.getValue('extensions.mpagespace.customcssfile', null);
  },

  setCustomCssFile: function(value) {
    mpagespace.fuelApplication.prefs.setValue('extensions.mpagespace.customcssfile', value);
  },

  openAbout: function() {
    window.open('chrome://mpagespace/content/about.xul','','chrome,centerscreen,dialog');  
    return false;
  },

  addPage: function() {
    var check = {value: false};
    var input = {value: ''};
    var result = mpagespace.promptsService.prompt(null, mpagespace.translate('addPage.title'), 
        mpagespace.translate('addPage.message'), input, null, check);   
    if (result) {
      var model = mpagespace.app.getModel();
      try {
        var page = model.addPage(input.value);
        model.changeActivePage(page.id);
      } catch (e) {
        alert(e.message);
      }
    }
  },

  openOptions: function() {
    window.open('chrome://mpagespace/content/options.xul','','chrome,centerscreen');  
    return false;
  },

  populatePageTreeMenu: function() {
    var prepareOpenPageFunc = function(pageId) {
      return function() { 
        mpagespace.app.openPage(pageId);
      };
    }

    var model = mpagespace.app.getModel();
    if (model == null) {
      return;
    }
    var indicatorBarEl = document.getElementById('mpagespace-drop-indicator-bar'); 
    var menuIds = ['mpagespace-toolbar-button', 'mpagespace-button-1', 'mpagespace-button-2'];
    for (var i=0; i<menuIds.length; i++) {
      var menu = document.getElementById(menuIds[i]).firstChild;
      menu.removeChild(menu.lastChild);
      for (let el=menu.lastChild; 
          el && el.nodeName.toLowerCase() != 'menuseparator';
          el = el.previousSibling, el.parentNode.removeChild(el.nextSibling));
      menu.appendChild(indicatorBarEl);

      for (var j=0, pageOrder=model.getPageOrder(); j<pageOrder.length; j++) {
        let p = model.getPage(pageOrder[j]); 
        let item = document.createElement('menuitem');
        item.setAttribute('label', p.title);
        var suffix = menuIds[i].substr(menuIds[i].lastIndexOf('-'));
        item.setAttribute('id', 'mpagespace-page-menuitem-' + p.id + suffix);
        item.addEventListener('command', prepareOpenPageFunc(p.id), false);
        item.addEventListener('dragstart', mpagespace.app.menuDndHandler.dragStart, false);
        item.addEventListener('dragend', mpagespace.app.menuDndHandler.dragEnd, false);
        menu.appendChild(item);
      }
      menu.appendChild(document.createElement('menuseparator'));
    }
  },

  firstRun: function() {
    if (mpagespace.fuelApplication.prefs.getValue('extensions.mpagespace.version', '0') != mpagespace.version) {
      mpagespace.fuelApplication.prefs.setValue('extensions.mpagespace.version', mpagespace.version);

      var toolbar = document.getElementById('addon-bar') || document.getElementById('nav-bar');
      var before = document.getElementById('addonbar-closebutton');
      
      toolbar.insertItem('mpagespace-toolbar-button', before);
      toolbar.setAttribute('currentset', toolbar.currentSet);  
      document.persist(toolbar.id, 'currentset');  
      
      if (toolbar.getAttribute('id') == 'addon-bar')
        toolbar.collapsed = false;
      
      mpagespace.dump('app.firstRun: Addon is set up.');
    }
  },

  checkToolbarVisibility: function() {
    if (mpagespace.fuelApplication.prefs.getValue('extensions.mpagespace.checkToolbarVisibility', true)) {
      var toolbar = document.getElementById('addon-bar') || document.getElementById('nav-bar');
      var hidingAttribute = toolbar.getAttribute('type') == 'menubar' ? 'autohide' : 'collapsed';
      if (toolbar.getAttribute(hidingAttribute) == 'true') {
        var check = {value: true};
        var result = mpagespace.promptsService.confirmCheck(null, mpagespace.translate('toolbarVisibility.title'), 
            mpagespace.translate('toolbarVisibility.message'), mpagespace.translate('doNotAskAgain.label'), check);
        if (result) {
          toolbar.setAttribute(hidingAttribute, false);
          document.persist(toolbar.id, hidingAttribute);
        }
        mpagespace.fuelApplication.prefs.setValue('extensions.mpagespace.checkToolbarVisibility', !check.value);
      }
    }
  },

  menuDndHandler: {
    dragStart: function(event) {
      event.dataTransfer.setData('application/mpage-page', this.getAttribute('id')); 
      event.stopPropagation();
    },

    dragEnter: function(event) {
      if (!event.dataTransfer.types.contains('application/mpage-widget')) 
        return;

      if (this.nodeName.toLowerCase() == 'toolbarbutton') {
        this.open = true;
      } else if (this.nodeName.toLowerCase() == 'menupopup') {
        if (this._mpagespace == null)
          this._mpagespace = {};
      } 
      event.preventDefault();
      event.stopPropagation();
    },

    dragOver: function(event) {
      if (event.dataTransfer.types.contains('application/mpage-page')) {
        if (this._mpagespace && this._mpagespace.timer) {
          this._mpagespace.timer.cancel();
        }
        var indicatorBarEl = document.getElementById('mpagespace-drop-indicator-bar'); 
        indicatorBarEl.hidden = false;
        var refEl = this.lastChild;
        for (var n=this.lastChild; n; n=n.previousSibling) {
          if (n.nodeName.toLowerCase() == 'menuitem' && 
              n.getAttribute('id').indexOf('mpagespace-page-menuitem-') != -1) {
              if ((event.screenY + 1 - n.boxObject.screenY) / n.boxObject.height < 0.5) {
                refEl = n;
              } else
                break;
          }
        }
        if (refEl != indicatorBarEl.nextSibling)
          this.insertBefore(indicatorBarEl, refEl);
        event.preventDefault();
        event.stopPropagation();

      } else if (event.dataTransfer.types.contains('application/mpage-widget')) {
        if (this._mpagespace && this._mpagespace.timer) {
          this._mpagespace.timer.cancel();
        }
        for (var n=this.firstChild; n; n=n.nextSibling) {
          if (n.nodeName.toLowerCase() == 'menuitem' &&
              n.getAttribute('id').indexOf('mpagespace-page-menuitem-') != -1) {
            n.removeAttribute('_moz-menuactive');
            if (event.screenY > n.boxObject.screenY &&
                event.screenY + 1 - n.boxObject.screenY < n.boxObject.height) {
              n.setAttribute('_moz-menuactive', true);
              this._mpagespace.menuactive = n;
            }
          }
        }
        event.preventDefault();
        event.stopPropagation();
      }
    },

    dragLeave: function(event) {
      var isDescendant = function(parentEl, childEl) {
        if (childEl == null)
          return false;
        else if (childEl.parentNode == parentEl)
          return true;
        else
          return isDescendant(parentEl, childEl.parentNode);
      };

      if (event.dataTransfer.types.contains('application/mpage-widget') ||
          event.dataTransfer.types.contains('application/mpage-page')) {
        if (!isDescendant(this, event.relatedTarget) &&
            this.nodeName.toLowerCase() == 'menupopup') {
          var timer = Components.classes["@mozilla.org/timer;1"]
            .createInstance(Components.interfaces.nsITimer);
          var self = this;
          var timerCallback = {
            notify: function() {
              if (event.dataTransfer.types.contains('application/mpage-widget')) {
                for (var n=self.firstChild; n; n=n.nextSibling) {
                  n.removeAttribute('_moz-menuactive');
                }
                self.parentNode.open = false; 
              } else {
                document.getElementById('mpagespace-drop-indicator-bar').hidden = true; 
              }
            }
          };
          timer.initWithCallback(timerCallback, 350, timer.TYPE_ONE_SHOT);
          this._mpagespace.timer = timer;
        } 
        event.preventDefault();
        event.stopPropagation();
      }
    },

    drop: function(event) {
      var data, pageId;
      var model = mpagespace.app.getModel();

      if (event.dataTransfer.types.contains('application/mpage-page')) {
        data = event.dataTransfer.getData('application/mpage-page');
        var el = document.getElementById(data);
        var indicatorBarEl = document.getElementById('mpagespace-drop-indicator-bar'); 
        indicatorBarEl.hidden = true;
        el.parentNode.insertBefore(el, indicatorBarEl);
        
        var order = [];
        for (;el && el.nodeName.toLowerCase() != 'menuseparator'; el = el.previousSibling); 
        for (el = el.nextSibling; el && el.nodeName.toLowerCase() != 'menuseparator'; el = el.nextSibling) {
          pageId = parseInt(el.getAttribute('id').substr('mpagespace-page-menuitem-'.length)); 
          if (isNaN(pageId) == false) 
            order.push(pageId);
        }
        model.setPageOrder(order);
        event.preventDefault();
        event.stopPropagation();

      } else if (event.dataTransfer.types.contains('application/mpage-widget')) {
        data = event.dataTransfer.getData('application/mpage-widget');
        pageId = parseInt(this._mpagespace.menuactive.getAttribute('id').substr('mpagespace-page-menuitem-'.length)); 

        if (isNaN(pageId) == false) {
          var widget = model.getPage().getWidget(data.substr('widget-'.length));
          model.moveWidgetToPage(widget, pageId);
        }
        event.preventDefault();
        event.stopPropagation();
      }
    }, 

    dragEnd: function(event) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
}