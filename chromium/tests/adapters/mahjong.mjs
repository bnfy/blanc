// Renderer bodies ported verbatim from src/main/test-hook.js. Keep their
// fields, delays, mutations and cleanup aligned with the shipping hooks.
import {tabPage} from './core.mjs';
import {shippingPageUrl} from '../lib/page-shim.mjs';

async function mahjongPage(w) {
 const state=await w.snapshot();
 const tab=state.tabs.find(t=>String(t.id)===String(state.activeTabId));
 if(!tab||!shippingPageUrl(tab.committedUrl||tab.url).startsWith('blanc://mahjong/'))return null;
 return tabPage(w,tab.id);
}
const read=expression=>async w=>{
 const page=await mahjongPage(w);if(!page)return null;
 try{return await page.evalExpression(expression);}catch{return null;}
};
const renderer={
 readMahjongDom:read(`(() => {
          const tileRect = document.querySelector('.mj-tile:not([hidden])')?.getBoundingClientRect();
          const frameRect = document.querySelector('.mj-board-frame')?.getBoundingClientRect();
          const wrapRect = document.getElementById('mjBoardWrap')?.getBoundingClientRect();
          const boardRect = document.getElementById('mjBoard')?.getBoundingClientRect();
          const wrapStyles = document.getElementById('mjBoardWrap')
            ? getComputedStyle(document.getElementById('mjBoardWrap')) : null;
          const safe = (name) => Math.max(0, Number.parseFloat(wrapStyles?.getPropertyValue(name)) || 0);
          const boardSafeOffsetX = (safe('--mj-board-safe-left') - safe('--mj-board-safe-right')) / 2;
          const tileRects = [...document.querySelectorAll('.mj-tile:not([hidden])')].map((tile) => tile.getBoundingClientRect());
          const tilesRect = tileRects.length ? {
            left: Math.min(...tileRects.map((r) => r.left)),
            right: Math.max(...tileRects.map((r) => r.right)),
          } : null;
          const dockRect = document.querySelector('.mj-dock')?.getBoundingClientRect();
          const dockButtons = [...document.querySelectorAll('.mj-dock > button')]
            .map((button) => button.getBoundingClientRect());
          const fontSelectors = ['.mj-title', '.mj-session', '.mj-meter-label', '.mj-dock-action', '.mj-tray-kicker'];
          const firstDockButton = dockButtons[0];
          const secondDockButton = dockButtons[1];
          return {
            url: location.href,
            tileCount: document.querySelectorAll('.mj-tile').length,
            freeTileCount: document.querySelectorAll('.mj-tile:not([data-blocked])').length,
            timer: document.getElementById('mjTimer')?.textContent ?? null,
            mode: document.querySelector('.mj')?.dataset.mode ?? null,
            layout: document.querySelector('.mj')?.dataset.layout ?? null,
            tileWidth: tileRect?.width ?? 0,
            tileHeight: tileRect?.height ?? 0,
            boardFrameHeight: frameRect?.height ?? 0,
            boardWrapWidth: wrapRect?.width ?? 0,
            // The visible tiles centre in the frame's space beside the dock:
            // since #931 the wrap keeps a safe area on the left for the dock
            // rail (--mj-board-safe-left/right) and fitBoard() shifts the board
            // by half the difference. Measured on the tiles, not the board's
            // box, which fitBoard() also offsets so the tiles of each layout
            // (Daily changes every day) sit centred.
            boardCenterDeltaX: tilesRect && frameRect
              ? Math.abs((tilesRect.left + tilesRect.right - frameRect.left - frameRect.right) / 2
                - boardSafeOffsetX)
              : Infinity,
            boardFrameLeft: frameRect?.left ?? 0,
            boardFrameRight: frameRect?.right ?? 0,
            boardFrameTop: frameRect?.top ?? 0,
            boardFrameBottom: frameRect?.bottom ?? 0,
            dockLeft: dockRect?.left ?? 0,
            dockRight: dockRect?.right ?? 0,
            dockTop: dockRect?.top ?? 0,
            dockBottom: dockRect?.bottom ?? 0,
            dockButtonWidth: firstDockButton?.width ?? 0,
            dockButtonHeight: firstDockButton?.height ?? 0,
            dockButtonCount: dockButtons.length,
            dockButtonGap: firstDockButton && secondDockButton
              ? secondDockButton.top - firstDockButton.bottom
              : 0,
            fontSamples: fontSelectors.map((selector) => ({
              selector,
              family: getComputedStyle(document.querySelector(selector)).fontFamily,
            })),
            instrument: [...document.querySelectorAll('body, body *')]
              .filter((element) => getComputedStyle(element).fontFamily.includes('Instrument Sans'))
              .slice(0, 20)
              .map((element) => element.id || element.className || element.tagName),
            // Text that still falls back to Inter anywhere in its font stack
            // (the game's labels never do since #1489); tile art is excluded.
            interText: [...document.querySelectorAll('body, body *')]
              .filter((element) => !element.closest('.mj-face')
                && /(^|,)\\s*"?Inter"?\\s*(,|$)/.test(getComputedStyle(element).fontFamily))
              .slice(0, 20)
              .map((element) => element.id || element.className || element.tagName),
            // Tile faces are the shipped art since #931: SVG images, no glyphs.
            tileFaces: (() => {
              const faces = [...document.querySelectorAll('.mj-tile .mj-face')];
              const hrefs = faces.flatMap((face) => [...face.querySelectorAll('image')]
                .map((image) => image.getAttribute('href') ?? ''));
              return {
                count: faces.length,
                withArt: faces.filter((face) => face.querySelector('image')).length,
                glyphs: faces.reduce((total, face) => total + face.querySelectorAll('text').length, 0),
                hrefs: [...new Set(hrefs)],
              };
            })(),
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
          };
        })()`),
 readMahjongDealState:read(`(() => game ? ({
          layoutId: game.layoutId,
          seed: game.seed,
          mode: game.mode,
          burstRules: game.burstRules,
          zen: game.zen,
          dailyKey: game.dailyKey,
          kinds: game.kinds.slice(),
        }) : null)()`),
 copyMahjongDealFromBoards:read(`(async () => {
          openSetup();
          document.getElementById('mjCopyDeal')?.click();
          const live = document.getElementById('mjLive');
          const deadline = Date.now() + 2000;
          while (live?.textContent !== 'Deal link copied.' && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          const result = {
            live: live?.textContent ?? null,
            boardsOpen: !document.getElementById('mjSetupSheet').hidden,
          };
          closeSetup();
          return result;
        })()`),
 readMahjongCompletionGeometry:read(`(async () => {
          const card = document.getElementById('mjWin');
          const wrap = document.getElementById('mjBoardWrap');
          const time = document.getElementById('mjWinTime');
          const best = document.getElementById('mjWinBest');
          const lastAction = document.getElementById('mjWinBoards');
          if (!card || !wrap || !time || !best || !lastAction) return null;
          const wasHidden = card.hidden;
          const previousTime = time.textContent;
          const previousBest = best.textContent;
          const previousScrollTop = card.scrollTop;
          try {
            // Use the longest realistic Tray labels so containment reflects
            // the completed UI rather than its shorter dormant markup.
            time.textContent = '14,400 points · 9999:59';
            best.textContent = 'best 14,400 · 9999:59';
            card.hidden = false;
            card.scrollTop = 0;
            void card.offsetWidth;
            await new Promise((resolve) => setTimeout(resolve, 320));
            const cardRect = card.getBoundingClientRect();
            const wrapRect = wrap.getBoundingClientRect();
            const initialActionRect = lastAction.getBoundingClientRect();
            const actionInitiallyVisible =
              initialActionRect.top >= cardRect.top - 1 &&
              initialActionRect.bottom <= cardRect.bottom + 1;
            if (!actionInitiallyVisible) {
              card.scrollTop = card.scrollHeight;
              await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            }
            const actionRect = lastAction.getBoundingClientRect();
            const bodyRect = document.body.getBoundingClientRect();
            const cardStyle = getComputedStyle(card);
            return {
              card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
              wrap: { left: wrapRect.left, top: wrapRect.top, right: wrapRect.right, bottom: wrapRect.bottom },
              body: { left: bodyRect.left, top: bodyRect.top, right: bodyRect.right, bottom: bodyRect.bottom },
              viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
              centerDeltaX: Math.abs((cardRect.left + cardRect.right - innerWidth) / 2),
              centerDeltaY: Math.abs((cardRect.top + cardRect.bottom - innerHeight) / 2),
              documentClientWidth: document.documentElement.clientWidth,
              bodyClientWidth: document.body.clientWidth,
              bodyScrollWidth: document.body.scrollWidth,
              computedLeft: cardStyle.left,
              clientHeight: card.clientHeight,
              scrollHeight: card.scrollHeight,
              scrollTop: card.scrollTop,
              overflowY: cardStyle.overflowY,
              actionInitiallyVisible,
              actionVisibleAfterScroll:
                actionRect.top >= cardRect.top - 1 && actionRect.bottom <= cardRect.bottom + 1,
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
            };
          } finally {
            card.hidden = wasHidden;
            card.scrollTop = previousScrollTop;
            time.textContent = previousTime;
            best.textContent = previousBest;
          }
        })()`),
 readMahjongRecordsGeometry:read(`(async () => {
          const sheet = document.getElementById('mjRecordsSheet');
          const card = sheet?.querySelector('.mj-records-card');
          const trigger = document.getElementById('mjRecords');
          if (!sheet || !card || !trigger || typeof openRecords !== 'function' || typeof closeRecords !== 'function') return null;
          if (!sheet.hidden) closeRecords();
          openRecords();
          await new Promise((resolve) => setTimeout(resolve, 320));
          const cardRect = card.getBoundingClientRect();
          const measured = {
            card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
            viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
            scrollWidth: card.scrollWidth,
            clientWidth: card.clientWidth,
            overflowY: getComputedStyle(card).overflowY,
            rowCount: document.querySelectorAll('#mjRecordsRows tr').length,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            zoomFactor: outerWidth ? outerWidth / innerWidth : 1,
          };
          closeRecords();
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          measured.focusReturned = document.activeElement === trigger;
          return measured;
        })()`),
 rapidUndoMahjongMatch:read(`(async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const free = [...document.querySelectorAll('.mj-tile:not([data-blocked]):not([hidden])')];
          let pair = null;
          for (let first = 0; first < free.length && !pair; first += 1) {
            const firstName = free[first].getAttribute('aria-label')?.split(',')[0];
            for (let second = first + 1; second < free.length; second += 1) {
              const secondName = free[second].getAttribute('aria-label')?.split(',')[0];
              if (firstName && firstName === secondName) {
                pair = [free[first], free[second]];
                break;
              }
            }
          }
          if (!pair) return { matched: false };
          pair[0].click();
          pair[1].click();
          await sleep(50);
          document.getElementById('mjUndo')?.click();
          await sleep(900);
          return {
            matched: true,
            score: document.getElementById('mjScore')?.textContent ?? null,
            live: document.getElementById('mjLive')?.textContent ?? null,
            transientCount: document.querySelectorAll(
              '.mj-tile-flight, .mj-score-flight, .mj-tray-burst'
            ).length,
            comboFxClass: document.getElementById('mjComboFx')?.className ?? null,
          };
        })()`),
 auditMahjongCorrectness:read(`(async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const clickTile = async (index, delay = 420) => {
            tileButtons[index]?.click();
            await sleep(delay);
          };
          const highlighted = () => [...document.querySelectorAll('.mj-tile.hinted')]
            .map((tile) => Number(tile.dataset.i)).sort((a, b) => a - b);

          startGame({ layoutId: 'arch', mode: 'classic', seed: 91001 }, { soundCue: false });
          const classicHints = E.hintMoves(game);
          document.getElementById('mjHint').click();
          const firstHint = highlighted();
          document.getElementById('mjHint').click();
          const secondHint = highlighted();

          startGame({ layoutId: 'peaks', mode: 'tray', seed: 91002 }, { soundCue: false });
          const match = E.availableMoves(game).find((move) => move.length === 2 && !game.tray.includes(move[0]));
          if (!match) return { error: 'no Burst pair' };
          await clickTile(match[0]);
          await clickTile(match[1], 820);
          document.getElementById('mjUndo').click();
          await sleep(80);
          const matchUndo = {
            tray: game.tray.slice(),
            parked: match[0],
            mate: match[1],
            parkedRemoved: game.removed[match[0]],
            mateRemoved: game.removed[match[1]],
          };

          startGame({ layoutId: 'peaks', mode: 'tray', seed: 91003 }, { soundCue: false });
          const free = [...tileButtons]
            .filter((tile) => tile && !tile.dataset.blocked && !tile.hidden)
            .map((tile) => Number(tile.dataset.i));
          if (free.length < 4) return { error: 'not enough free tiles' };
          for (let index = 0; index < game.kinds.length; index += 1) game.kinds[index] = 'chr-9';
          for (let offset = 0; offset < 4; offset += 1) game.kinds[free[offset]] = 'chr-' + (offset + 1);
          renderBoard();
          refreshTiles();
          for (const index of free.slice(0, 3)) await clickTile(index);
          document.getElementById('mjHint').click();
          await sleep(30);
          const safeHint = {
            highlighted: highlighted(),
            live: document.getElementById('mjLive')?.textContent ?? null,
          };
          const parkedSet = new Set(free.slice(0, 4));
          const mates = game.kinds.map((_, index) => index)
            .filter((index) => !parkedSet.has(index)).slice(0, 4);
          for (let offset = 0; offset < 4; offset += 1) game.kinds[mates[offset]] = 'chr-' + (offset + 1);
          await clickTile(free[3]);
          const rescue = document.getElementById('mjRescue');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await sleep(30);
          const rescueEscape = {
            hidden: rescue.hidden,
            status: game.status,
            focus: document.activeElement?.id ?? null,
          };
          checkEndStates();
          const shuffled = shuffleGame();
          await sleep(620);
          document.getElementById('mjUndo').click();
          await sleep(80);
          const rescueUndo = {
            shuffled,
            visible: !rescue.hidden,
            status: game.status,
            traySize: game.tray.length,
          };

          startGame({
            layoutId: 'peaks', mode: 'tray', seed: 91004,
            burstRules: E.BURST_RULES.AUTO,
          }, { soundCue: false });
          openSetup();
          const burstControls = {
            autoVisible: !document.getElementById('mjAutoClearOption').hidden,
            zenVisible: !document.getElementById('mjZenOption').hidden,
          };
          document.getElementById('mjModeClassic').click();
          const classicControls = {
            autoVisible: !document.getElementById('mjAutoClearOption').hidden,
            zenVisible: !document.getElementById('mjZenOption').hidden,
          };
          const zenToggle = document.getElementById('mjZen');
          zenToggle.checked = true;
          zenToggle.dispatchEvent(new Event('change', { bubbles: true }));
          const recordEventCountBeforeZen = [...Array(localStorage.length).keys()]
            .map((index) => localStorage.key(index))
            .filter((key) => key?.startsWith(S.RECORD_EVENT_PREFIX)).length;
          startSetupChoice();
          startTimer();
          await sleep(80);
          pauseTimer();
          const zenTiming = {
            elapsedMs: game.elapsedMs,
            timerDisplay: getComputedStyle(document.getElementById('mjTimeMeter')).display,
            scoreDisplay: getComputedStyle(document.getElementById('mjScoreMeter')).display,
            badge: document.getElementById('mjRulesBadge').textContent,
          };
          game.removed.fill(true);
          game.status = 'won';
          game.completionRecorded = false;
          checkEndStates();
          const recordEventCountAfterZen = [...Array(localStorage.length).keys()]
            .map((index) => localStorage.key(index))
            .filter((key) => key?.startsWith(S.RECORD_EVENT_PREFIX)).length;
          const zenCompletion = {
            title: document.getElementById('mjWinTitle').textContent,
            rules: document.getElementById('mjWinRules').textContent,
            notice: document.getElementById('mjWinZen').textContent,
            resultHidden: document.getElementById('mjWinResult').hidden,
            eventDelta: recordEventCountAfterZen - recordEventCountBeforeZen,
          };

          openSetup();
          const zenReset = document.getElementById('mjZen').checked;
          document.getElementById('mjModeTray').click();
          const autoToggle = document.getElementById('mjAutoClears');
          autoToggle.checked = false;
          autoToggle.dispatchEvent(new Event('change', { bubbles: true }));
          startSetupChoice();
          const manualGame = {
            burstRules: game.burstRules,
            scoringRevision: game.scoringRevision,
            badge: document.getElementById('mjRulesBadge').textContent,
          };
          openSetup();
          const manualRemembered = !document.getElementById('mjAutoClears').checked;
          closeSetup();
          paintRecords();
          const burstLabels = [...document.querySelectorAll('#mjRecordsRows .mj-record-variants')]
            .flatMap((cell) => [...cell.querySelectorAll('small')].map((label) => label.textContent));

          const result = {
            classicHintCount: classicHints.length,
            firstHint,
            secondHint,
            matchUndo,
            safeHint,
            rescueEscape,
            rescueUndo,
            burstControls,
            classicControls,
            zenTiming,
            zenCompletion,
            zenReset,
            manualGame,
            manualRemembered,
            burstLabels,
          };
          startGame({
            layoutId: 'peaks', mode: 'tray', seed: 91005,
            burstRules: E.BURST_RULES.AUTO,
          }, { soundCue: false });
          return result;
        })()`),
};
export const mahjong={
 ...renderer,
 async readMahjongDom(w){
  const result=await renderer.readMahjongDom(w);
  if(result)result.url=shippingPageUrl(result.url);
  return result;
 },
 async copyMahjongDealFromBoards(w){
  const page=await mahjongPage(w);if(!page)return null;
  // Exercise the actual Clipboard API, then mirror what it wrote into the
  // runner's isolated clipboard (readClipboardText). Never synthesize a deal.
  const origin=await page.evalExpression('location.origin');
  const permission={name:'clipboard-read',allowWithoutGesture:true};
  await w.fixture.browser.send('Browser.setPermission',{permission,setting:'granted',origin});
  try{
   const result=await renderer.copyMahjongDealFromBoards(w);
   if(result?.live==='Deal link copied.'){
    const text=await page.evalExpression('navigator.clipboard.readText()');
    await w.native('setTestClipboard',[text]);
   }
   return result;
  }finally{
   await w.fixture.browser.send('Browser.setPermission',{permission,setting:'prompt',origin});
  }
 },
 activeTabZoomFactor:w=>w.native('activeTabZoomFactor'),
 setActiveTabZoomFactor:(w,factor)=>w.native('setActiveTabZoomFactor',[Math.min(3,Math.max(0.5,Number(factor)||1))]),
};
