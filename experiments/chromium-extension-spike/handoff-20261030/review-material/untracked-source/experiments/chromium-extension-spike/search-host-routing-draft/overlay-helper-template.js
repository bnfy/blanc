  // Preserve the typed value until the browser reports an observed outcome.
  // A browser-owned selection epoch distinguishes an expected new-tab
  // transition from tab switches, including a switch away and back.
  let addressSubmissionGeneration = 0;
  let addressSubmissionBusy = null;
  const addressSubmissionNotice = document.createElement('div');
  addressSubmissionNotice.className = 'command-notice';
  addressSubmissionNotice.id = 'addressSubmissionNotice';
  addressSubmissionNotice.setAttribute('role', 'alert');
  addressSubmissionNotice.hidden = true;
  islandPanel.querySelector('.panel-row').after(addressSubmissionNotice);
  const initialAddressDescription = addressInput.getAttribute('aria-describedby');
  const clearAddressSubmissionNotice = () => {
    addressSubmissionNotice.hidden = true;
    addressSubmissionNotice.textContent = '';
    addressInput.removeAttribute('aria-invalid');
    if (initialAddressDescription == null) addressInput.removeAttribute('aria-describedby');
    else addressInput.setAttribute('aria-describedby', initialAddressDescription);
  };
  const invalidateAddressSubmission = () => {
    addressSubmissionGeneration += 1;
    addressSubmissionBusy = null;
    addressInput.removeAttribute('aria-busy');
    clearAddressSubmissionNotice();
  };
  const isNextEpoch = (before, after) => {
    if (!/^[0-9]+$/.test(String(before)) || !/^[0-9]+$/.test(String(after))) return false;
    return BigInt(after) === BigInt(before) + 1n;
  };
  const outcomeCopy = () => {
    // Draft translations for the six supported shipping languages. The
    // browser-preference approximation and linguistic review remain open.
    const messages = {
      en: ['The action may still complete. Check the page before retrying.', 'Opening an app was requested. Check that it opened before retrying.'],
      de: ['Der Vorgang wird möglicherweise noch abgeschlossen. Prüfe die Seite, bevor du es erneut versuchst.', 'Das Öffnen einer App wurde angefordert. Prüfe, ob sie geöffnet wurde, bevor du es erneut versuchst.'],
      es: ['Puede que la acción aún se complete. Comprueba la página antes de volver a intentarlo.', 'Se solicitó abrir una aplicación. Comprueba si se abrió antes de volver a intentarlo.'],
      fr: ['L’action peut encore se terminer. Vérifiez la page avant de réessayer.', 'L’ouverture d’une application a été demandée. Vérifiez qu’elle est ouverte avant de réessayer.'],
      it: ['L’azione potrebbe essere ancora in corso. Controlla la pagina prima di riprovare.', 'È stata richiesta l’apertura di un’app. Controlla che sia aperta prima di riprovare.'],
      pt: ['A ação ainda pode ser concluída. Confira a página antes de tentar novamente.', 'A abertura de um aplicativo foi solicitada. Confira se ele abriu antes de tentar novamente.'],
    };
    const preferences = globalThis.navigator?.languages || [globalThis.navigator?.language || 'en'];
    for (const preference of preferences) {
      const language = String(preference).toLowerCase().split('-')[0];
      if (Object.hasOwn(messages, language)) return messages[language];
    }
    return messages.en;
  };
  const setAddressSubmissionState = (payload) => {
    if (payload.activeTabId !== state.activeTabId || payload.searchSelectionEpoch !== state.searchSelectionEpoch) {
      const pending = addressSubmissionBusy;
      const expectedTransition = pending?.createsTab && !pending.transition &&
          payload.activeTabId !== pending.originalTabId &&
          isNextEpoch(pending.originalEpoch, payload.searchSelectionEpoch);
      if (expectedTransition) pending.transition = { tabId: String(payload.activeTabId), epoch: payload.searchSelectionEpoch };
      else invalidateAddressSubmission();
    }
    state = payload;
  };
  addressInput.addEventListener('input', invalidateAddressSubmission);
  async function submitAddressAction(action, options = {}) {
    if (addressSubmissionBusy) return;
    const generation = ++addressSubmissionGeneration;
    const originalText = addressInput.value;
    const pending = { generation, originalTabId: state.activeTabId,
      originalEpoch: state.searchSelectionEpoch, createsTab: options.createsTab === true, transition: null };
    addressSubmissionBusy = pending;
    addressInput.setAttribute('aria-busy', 'true');
    clearAddressSubmissionNotice();
    const stillCurrent = (outcome) => {
      if (generation !== addressSubmissionGeneration || addressInput.value !== originalText ||
          (mode !== 'panel' && mode !== 'palette')) return false;
      if (!pending.transition && pending.createsTab && outcome?.tabId != null) return false;
      if (!pending.transition)
        return state.activeTabId === pending.originalTabId && state.searchSelectionEpoch === pending.originalEpoch;
      return pending.createsTab && String(outcome?.tabId) === pending.transition.tabId &&
          outcome?.selectionEpoch === pending.transition.epoch &&
          String(state.activeTabId) === pending.transition.tabId && state.searchSelectionEpoch === pending.transition.epoch;
    };
    try {
      const outcome = await action();
      if (outcome === false) throw new Error('not accepted');
      if (!stillCurrent(outcome)) {
        // A created identity without an observed snapshot is not enough to
        // close: the current tab may have changed while refresh failed.
        if (pending.createsTab && !pending.transition && outcome?.tabId != null &&
            generation === addressSubmissionGeneration && addressInput.value === originalText &&
            state.activeTabId === pending.originalTabId && state.searchSelectionEpoch === pending.originalEpoch) {
          addressSubmissionNotice.textContent = outcomeCopy()[0];
          addressSubmissionNotice.hidden = false;
          addressInput.setAttribute('aria-describedby', 'addressSubmissionNotice');
          addressInput.focus();
        }
        return;
      }
      if (outcome?.status === 'handoff-requested' || outcome?.status === 'unknown') {
        addressSubmissionNotice.textContent = outcomeCopy()[outcome.status === 'unknown' ? 0 : 1];
        addressSubmissionNotice.hidden = false;
        addressInput.setAttribute('aria-describedby', 'addressSubmissionNotice');
        addressInput.focus();
      } else if (outcome?.status === 'failed') {
        addressSubmissionNotice.textContent = blancI18n.t('ws.error.generic');
        addressSubmissionNotice.hidden = false;
        addressInput.setAttribute('aria-invalid', 'true');
        addressInput.setAttribute('aria-describedby', 'addressSubmissionNotice');
        addressInput.focus();
      } else window.browserAPI.closeOverlay();
    } catch (error) {
      const transitionedButUnverified = pending.createsTab && pending.transition &&
          generation === addressSubmissionGeneration && addressInput.value === originalText &&
          String(state.activeTabId) === pending.transition.tabId && state.searchSelectionEpoch === pending.transition.epoch &&
          (mode === 'panel' || mode === 'palette');
      if (transitionedButUnverified) {
        addressSubmissionNotice.textContent = outcomeCopy()[0];
        addressSubmissionNotice.hidden = false;
        addressInput.setAttribute('aria-describedby', 'addressSubmissionNotice');
        addressInput.focus();
      } else if (stillCurrent(null)) {
        addressSubmissionNotice.textContent = error?.message === 'The action may still complete. Check the page before retrying.'
            ? outcomeCopy()[0] : blancI18n.t('ws.error.generic');
        addressSubmissionNotice.hidden = false;
        addressInput.setAttribute('aria-invalid', 'true');
        addressInput.setAttribute('aria-describedby', 'addressSubmissionNotice');
        addressInput.focus();
      }
    } finally {
      if (addressSubmissionBusy === pending) {
        addressSubmissionBusy = null;
        addressInput.removeAttribute('aria-busy');
      }
    }
  }
