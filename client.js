/**
 * Client half of dsh-pushups.
 *
 * A compact debt chip under the composer plus a dialog with the ledger,
 * partial payments, and the language switch (English by default).
 */
window.__ModuleLoader__.load({
  id: 'dsh-pushups',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const LANG_KEY = 'dsh.pushups.lang.v1'
    const LANGS = ['en', 'ru', 'zh']
    const REFRESH_MS = 8000
    const QUICK_AMOUNTS = [5, 10, 25]

    const DICT = {
      en: {
        badge: 'Push-ups',
        owed: 'owed',
        title: 'Push-ups',
        subtitle: 'Typing is not cardio. One push-up per message you send — pay them off when you stand up.',
        since: 'Counting since {date}',
        total: 'Messages',
        debt: 'Debt',
        streak: 'Streak',
        days: 'days',
        pay: 'Pay off',
        custom: 'Custom amount',
        customPlaceholder: 'e.g. 12',
        all: 'All',
        add: 'Add',
        recent: 'Recent payments',
        noPayments: 'Nothing paid yet.',
        today: '{messages} messages today, {paid} push-ups paid',
        reset: 'Reset everything',
        confirmReset: 'Confirm reset?',
        resetHint: 'Zeroes the lifetime count, the debt and the history. Cannot be undone.',
        close: 'Close',
        language: 'Language',
        loading: 'Loading…',
        unavailable: 'Push-up counter is unavailable',
        error: 'Something went wrong: {error}',
        paidOne: 'paid',
        noDebt: 'All paid off',
        payAll: 'Pay off the debt',
      },
      ru: {
        badge: 'Отжимания',
        owed: 'в долгу',
        title: 'Отжимания',
        subtitle: 'Печатать — не кардио. Одно отжимание за сообщение — закрывай долг, когда встаёшь.',
        since: 'Считаем с {date}',
        total: 'Сообщений',
        debt: 'Долг',
        streak: 'Серия',
        days: 'дн.',
        pay: 'Оплатить',
        custom: 'Своя сумма',
        customPlaceholder: 'например, 12',
        all: 'Весь долг',
        add: 'Добавить',
        recent: 'Последние оплаты',
        noPayments: 'Пока ничего не оплачено.',
        today: 'Сегодня {messages} сообщений и {paid} отжиманий',
        reset: 'Сбросить всё',
        confirmReset: 'Точно сбросить?',
        resetHint: 'Обнулит счётчик за всё время, долг и историю. Отменить нельзя.',
        close: 'Закрыть',
        language: 'Язык',
        loading: 'Загрузка…',
        unavailable: 'Счётчик отжиманий недоступен',
        error: 'Что-то пошло не так: {error}',
        paidOne: 'оплачено',
        noDebt: 'Всё закрыто',
        payAll: 'Закрыть долг',
      },
      zh: {
        badge: '俯卧撑',
        owed: '欠',
        title: '俯卧撑',
        subtitle: '打字不算有氧。每发一条消息记一个俯卧撑，起身时结清。',
        since: '从 {date} 开始计数',
        total: '消息',
        debt: '欠账',
        streak: '连续',
        days: '天',
        pay: '结清',
        custom: '自定义数量',
        customPlaceholder: '例如 12',
        all: '全部',
        add: '添加',
        recent: '最近结清',
        noPayments: '还没有结清记录。',
        today: '今天 {messages} 条消息，已做 {paid} 个',
        reset: '全部重置',
        confirmReset: '确认重置？',
        resetHint: '将清零累计消息、欠账和历史记录，且无法撤销。',
        close: '关闭',
        language: '语言',
        loading: '加载中…',
        unavailable: '俯卧撑计数不可用',
        error: '出错了：{error}',
        paidOne: '已做',
        noDebt: '已全部结清',
        payAll: '结清欠账',
      },
    }

    function pickLang() {
      try {
        const stored = window.localStorage.getItem(LANG_KEY)
        if (stored && LANGS.includes(stored)) return stored
      } catch {
        /* storage may be unavailable */
      }
      const browser = (navigator.language || 'en').toLowerCase()
      if (browser.startsWith('ru')) return 'ru'
      if (browser.startsWith('zh')) return 'zh'
      return 'en'
    }

    function translate(lang, key, variables) {
      const dict = DICT[lang] || DICT.en
      let text = dict[key] || DICT.en[key] || key
      if (variables) {
        for (const [name, value] of Object.entries(variables)) text = text.split(`{${name}}`).join(String(value))
      }
      return text
    }

    const TOKENS = {
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      borderStrong: 'var(--dsw-alias-border-l2)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      surfaceRaised: 'var(--dsw-alias-bg-layer-2)',
      brand: 'var(--dsw-alias-brand-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
    }

    function debtColor(debt) {
      if (debt <= 0) return TOKENS.success
      if (debt < 10) return TOKENS.muted
      if (debt < 30) return TOKENS.warn
      return TOKENS.error
    }

    function formatDate(ts) {
      try {
        return new Date(ts).toLocaleDateString()
      } catch {
        return String(ts)
      }
    }

    function formatTime(ts) {
      try {
        return new Date(ts).toLocaleString()
      } catch {
        return String(ts)
      }
    }

    const chipStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 22,
      padding: '0 9px',
      borderRadius: 11,
      border: `1px solid ${TOKENS.border}`,
      background: 'transparent',
      color: TOKENS.muted,
      font: 'inherit',
      fontSize: 12,
      lineHeight: '18px',
      cursor: 'pointer',
    }

    function Dumbbell() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true, style: { display: 'block' } },
        h('rect', { x: 1, y: 5.5, width: 3, height: 5, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 12, y: 5.5, width: 3, height: 5, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 4.5, y: 7, width: 7, height: 2, rx: 1, fill: 'currentColor' }),
      )
    }

    function Check() {
      return h(
        'svg',
        { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true, style: { display: 'block' } },
        h('path', {
          d: 'M3 8.5 6.2 12 13 4.5',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    const buttonStyle = {
      font: 'inherit',
      fontSize: 13,
      lineHeight: '18px',
      padding: '4px 10px',
      borderRadius: 8,
      border: `1px solid ${TOKENS.border}`,
      background: 'transparent',
      color: TOKENS.text,
      cursor: 'pointer',
    }

    function PayRow({ t, debt, onPay, busy }) {
      const [custom, setCustom] = useState('')
      const amounts = QUICK_AMOUNTS.filter((amount) => amount <= debt)
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          ...amounts.map((amount) =>
            h('button', {
              key: `q${amount}`,
              type: 'button',
              disabled: busy,
              style: buttonStyle,
              onClick: () => onPay(amount),
            }, `+${amount}`),
          ),
          debt > 0
            ? h('button', {
                key: 'all',
                type: 'button',
                disabled: busy,
                style: { ...buttonStyle, color: TOKENS.error, borderColor: TOKENS.error },
                onClick: () => onPay(debt),
              }, t('all'))
            : null,
        ),
        h(
          'form',
          {
            style: { display: 'flex', gap: 6 },
            onSubmit: (event) => {
              event.preventDefault()
              const amount = Number(custom)
              if (!Number.isSafeInteger(amount) || amount <= 0 || amount > debt) return
              onPay(amount)
              setCustom('')
            },
          },
          h('input', {
            type: 'number',
            min: 1,
            max: debt || 1,
            inputMode: 'numeric',
            value: custom,
            placeholder: t('customPlaceholder'),
            'aria-label': t('custom'),
            onChange: (event) => setCustom(event.target.value),
            style: {
              font: 'inherit',
              fontSize: 13,
              flex: 1,
              minWidth: 0,
              padding: '4px 8px',
              borderRadius: 8,
              border: `1px solid ${TOKENS.border}`,
              background: TOKENS.surfaceRaised,
              color: TOKENS.text,
            },
          }),
          h('button', {
            type: 'submit',
            disabled: busy || !custom,
            style: { ...buttonStyle, borderColor: TOKENS.brand, color: TOKENS.brand },
          }, t('add')),
        ),
      )
    }

    function Dialog({ t, lang, state, onLang, onPay, onReset, onClose, busy, error }) {
      const [armed, setArmed] = useState(false)
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      const stat = (label, value, color) =>
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' } },
          h('div', { style: { fontSize: 20, fontWeight: 600, color: color || TOKENS.text } }, String(value)),
          h('div', { style: { fontSize: 11, color: TOKENS.muted } }, label),
        )

      return h(
        'div',
        {
          role: 'presentation',
          onClick: onClose,
          style: {
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 32%, transparent)',
          },
        },
        h(
          'div',
          {
            role: 'dialog',
            'aria-modal': true,
            'aria-label': t('title'),
            onClick: (event) => event.stopPropagation(),
            style: {
              width: 'min(380px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              padding: 16,
              borderRadius: 14,
              border: `1px solid ${TOKENS.borderStrong}`,
              background: TOKENS.surface,
              color: TOKENS.text,
              boxShadow: '0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent)',
              fontSize: 13,
              lineHeight: '18px',
            },
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'flex-start', gap: 8 } },
            h(
              'div',
              { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 } },
              h('div', { style: { fontSize: 15, fontWeight: 600 } }, t('title')),
              h('div', { style: { color: TOKENS.muted } }, t('subtitle')),
              state
                ? h('div', { style: { color: TOKENS.muted, fontSize: 12 } }, t('since', { date: formatDate(state.installedAt) }))
                : null,
            ),
            h('button', {
              type: 'button',
              'aria-label': t('close'),
              onClick: onClose,
              style: { ...buttonStyle, border: 'none', padding: '0 4px', fontSize: 18, lineHeight: '18px', color: TOKENS.muted },
            }, '×'),
          ),

          !state
            ? h('div', { style: { color: TOKENS.muted } }, t('loading'))
            : h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
                h(
                  'div',
                  {
                    style: {
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      padding: '10px 8px',
                      borderRadius: 10,
                      background: TOKENS.surfaceRaised,
                    },
                  },
                  stat(t('total'), state.total),
                  stat(t('debt'), state.debt, debtColor(state.debt)),
                  stat(t('streak'), `${state.streak}`),
                ),
                h('div', { style: { color: TOKENS.muted, fontSize: 12 } },
                  t('today', { messages: state.today ? state.today.messages : 0, paid: state.today ? state.today.paid : 0 })),
                state.debt > 0
                  ? h(PayRow, { t, debt: state.debt, busy, onPay })
                  : h('div', { style: { color: TOKENS.success, fontWeight: 500 } }, t('noDebt')),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                  h('div', { style: { fontSize: 12, color: TOKENS.muted } }, t('recent')),
                  state.payments.length === 0
                    ? h('div', { style: { color: TOKENS.muted, fontSize: 12 } }, t('noPayments'))
                    : h(
                        'div',
                        { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                        ...state.payments.slice(0, 6).map((payment) =>
                          h(
                            'div',
                            {
                              key: `${payment.at}-${payment.amount}`,
                              style: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 },
                            },
                            h('span', { style: { color: TOKENS.text } }, `−${payment.amount} ${t('paidOne')}`),
                            h('span', { style: { color: TOKENS.muted } }, formatTime(payment.at)),
                          ),
                        ),
                      ),
                ),
              ),

          error ? h('div', { style: { color: TOKENS.error, fontSize: 12 } }, t('error', { error })) : null,

          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${TOKENS.border}`, paddingTop: 10 } },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOKENS.muted } },
              h('span', null, t('language')),
              ...LANGS.map((code) =>
                h('button', {
                  key: code,
                  type: 'button',
                  onClick: () => onLang(code),
                  style: {
                    ...buttonStyle,
                    padding: '2px 8px',
                    fontSize: 12,
                    borderColor: code === lang ? TOKENS.brand : TOKENS.border,
                    color: code === lang ? TOKENS.brand : TOKENS.muted,
                  },
                }, code === 'zh' ? '中文' : code.toUpperCase()),
              ),
            ),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              h('button', {
                type: 'button',
                disabled: busy,
                onClick: () => {
                  if (!armed) {
                    setArmed(true)
                    return
                  }
                  setArmed(false)
                  onReset()
                },
                style: {
                  ...buttonStyle,
                  fontSize: 12,
                  borderColor: armed ? TOKENS.error : TOKENS.border,
                  color: armed ? TOKENS.error : TOKENS.muted,
                },
              }, armed ? t('confirmReset') : t('reset')),
              armed ? h('span', { style: { fontSize: 11, color: TOKENS.muted } }, t('resetHint')) : null,
            ),
          ),
        ),
      )
    }

    function Pushups(props) {
      const useSession = props.useSession
      const pending = useSession ? useSession((snapshot) => (snapshot && snapshot.pendingSubmissions ? snapshot.pendingSubmissions.length : 0)) : 0
      const [lang, setLang] = useState(pickLang)
      const [state, setState] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [open, setOpen] = useState(false)

      const t = useCallback((key, variables) => translate(lang, key, variables), [lang])

      const load = useCallback(async () => {
        try {
          const response = await fetch('/pushups/state', { cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const value = await response.json()
          setState(value)
          setError(null)
        } catch (failure) {
          setError(String((failure && failure.message) || failure))
        }
      }, [])

      useEffect(() => {
        load()
      }, [load, pending])

      useEffect(() => {
        const timer = window.setInterval(load, REFRESH_MS)
        const onVisible = () => {
          if (document.visibilityState === 'visible') load()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
          window.clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisible)
        }
      }, [load])

      useEffect(() => {
        try {
          window.localStorage.setItem(LANG_KEY, lang)
        } catch {
          /* storage may be unavailable */
        }
      }, [lang])

      const request = useCallback(async (path, body) => {
        setBusy(true)
        try {
          const response = await fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          const value = await response.json()
          if (!response.ok) throw new Error(value && value.error ? value.error : `HTTP ${response.status}`)
          setState(value)
          setError(null)
        } catch (failure) {
          setError(String((failure && failure.message) || failure))
        } finally {
          setBusy(false)
        }
      }, [])

      const onPay = useCallback((amount) => request('/pushups/pay', { amount }), [request])
      const onReset = useCallback(() => request('/pushups/reset', { confirm: true }), [request])
      const onClose = useCallback(() => setOpen(false), [])
      const onLang = useCallback((code) => setLang(code), [])

      const debt = state ? state.debt : 0
      const color = debtColor(debt)
      const label = state ? `${t('badge')}: ${debt}` : t('badge')

      const chip = h(
        'button',
        {
          type: 'button',
          onClick: () => setOpen(true),
          title: state ? `${debt} ${t('owed')}` : t('loading'),
          'aria-label': state ? `${t('badge')}: ${debt}` : t('badge'),
          style: { ...chipStyle, color: state ? color : TOKENS.muted, borderColor: state ? color : TOKENS.border },
        },
        h(Dumbbell),
        h('span', null, label),
        error ? h('span', { style: { color: TOKENS.error, fontSize: 11 } }, '!') : null,
      )

      const quickPay =
        state && debt > 0
          ? h(
              'button',
              {
                type: 'button',
                disabled: busy,
                onClick: () => onPay(debt),
                title: `${t('payAll')}: ${debt}`,
                'aria-label': `${t('payAll')}: ${debt}`,
                style: {
                  ...chipStyle,
                  width: 22,
                  padding: 0,
                  justifyContent: 'center',
                  color: TOKENS.success,
                  borderColor: TOKENS.success,
                  opacity: busy ? 0.5 : 1,
                },
              },
              h(Check),
            )
          : null

      return h(
        React.Fragment,
        null,
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, chip, quickPay),
        open
          ? h(Dialog, { t, lang, state, onLang, onPay, onReset, onClose, busy, error })
          : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({ name: 'conversation.composer.dock', id: 'pushups', order: 10 }, Pushups),
        )
      },
    }
  },
})
