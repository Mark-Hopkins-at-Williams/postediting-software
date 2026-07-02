// Plain React (no JSX, no build step) — see README for why.
'use strict';

const { useState, useEffect, useCallback, useRef } = React;
const h = React.createElement;

function useRecords() {
  const [records, setRecords] = useState(null); // null while loading
  const [filename, setFilename] = useState('');
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    fetch('/api/records')
      .then((r) => r.json())
      .then((data) => {
        setRecords(data.records);
        setFilename(data.file);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  return { records, setRecords, filename, loadError };
}

function Sidebar(props) {
  const { records, currentIndex, onSelect, onlyUnedited, setOnlyUnedited } = props;

  const items = records
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !onlyUnedited || !r.edited);

  return h(
    'div',
    { className: 'sidebar' },
    h(
      'label',
      { className: 'sidebar-filter' },
      h('input', {
        type: 'checkbox',
        checked: onlyUnedited,
        onChange: (e) => setOnlyUnedited(e.target.checked),
      }),
      'Show only unedited'
    ),
    items.map(({ r, i }) =>
      h(
        'div',
        {
          key: r.unit_id,
          className: 'sidebar-item' + (i === currentIndex ? ' active' : ''),
          onClick: () => onSelect(i),
        },
        h('span', { className: 'pos' }, i + 1),
        h('span', { className: 'dot' + (r.edited ? ' edited' : '') }),
        h('span', { className: 'preview' }, r.source_text)
      )
    )
  );
}

function Editor(props) {
  const { record, draft, setDraft, onSave, onPrev, onNext, saveState, hasPrev, hasNext } = props;

  const textareaRef = useRef(null);

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSave();
    }
  };

  return h(
    'div',
    { className: 'editor' },
    h(
      'div',
      { className: 'field' },
      h('label', null, 'Source text'),
      h('div', { className: 'source-box' }, record.source_text)
    ),
    h(
      'div',
      { className: 'field' },
      h('label', null, 'Raw MT output (reference, not editable)'),
      h('div', { className: 'raw-mt-box', lang: 'am' }, record.mt_text)
    ),
    h(
      'div',
      { className: 'field' },
      h('label', null, 'Post-edited translation'),
      h('textarea', {
        ref: textareaRef,
        className: 'pe-box',
        lang: 'am',
        value: draft,
        onChange: (e) => setDraft(e.target.value),
        onKeyDown: handleKeyDown,
      }),
      h(
        'div',
        { className: 'controls' },
        h(
          'button',
          { className: 'primary', onClick: onSave, disabled: saveState === 'saving' },
          saveState === 'saving' ? 'Saving…' : 'Save'
        ),
        h('button', { onClick: () => setDraft(record.mt_text) }, 'Reset to raw MT'),
        h('button', { onClick: onPrev, disabled: !hasPrev }, '← Prev'),
        h('button', { onClick: onNext, disabled: !hasNext }, 'Next →'),
        h(
          'span',
          { className: 'save-status' + (saveState === 'saved' ? ' saved' : saveState === 'error' ? ' error' : '') },
          saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''
        )
      ),
      h('div', { className: 'hint' }, 'Tip: Ctrl/Cmd+Enter to save.')
    )
  );
}

function App() {
  const { records, setRecords, filename, loadError } = useRecords();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [onlyUnedited, setOnlyUnedited] = useState(false);
  const lastLoadedIndex = useRef(null);

  const current = records ? records[currentIndex] : null;

  // Reset the draft text whenever the user navigates to a different record
  // (but not when `records` is replaced in place by a save at the same index).
  useEffect(() => {
    if (!records || !records[currentIndex]) return;
    if (lastLoadedIndex.current === currentIndex) return;
    const rec = records[currentIndex];
    setDraft(rec.pe_text != null ? rec.pe_text : rec.mt_text);
    setSaveState('idle');
    lastLoadedIndex.current = currentIndex;
  }, [records, currentIndex]);

  const save = useCallback(async () => {
    if (!current) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/records/${currentIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pe_text: draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'save failed');
      setRecords((prev) => prev.map((r, i) => (i === currentIndex ? body.record : r)));
      setSaveState('saved');
    } catch (e) {
      console.error(e);
      setSaveState('error');
    }
  }, [current, draft, currentIndex, setRecords]);

  const goTo = (i) => {
    if (!records || i < 0 || i >= records.length) return;
    setCurrentIndex(i);
  };

  const goNext = () => goTo(currentIndex + 1);
  const goPrev = () => goTo(currentIndex - 1);

  if (loadError) {
    return h('div', { className: 'empty-state' }, `Failed to load data: ${loadError}`);
  }
  if (!records) {
    return h('div', { className: 'empty-state' }, 'Loading…');
  }

  const editedCount = records.filter((r) => r.edited).length;
  const pct = records.length ? Math.round((100 * editedCount) / records.length) : 0;

  return h(
    'div',
    { className: 'app' },
    h(
      'div',
      { className: 'topbar' },
      h('h1', null, 'MT Post-Editing'),
      h('span', { className: 'filename' }, filename),
      h(
        'div',
        { className: 'progress' },
        h('span', { className: 'progress-bar' }, h('span', { className: 'progress-bar-fill', style: { width: pct + '%' } })),
        `${editedCount} / ${records.length} edited`
      )
    ),
    h(
      'div',
      { className: 'main' },
      h(Sidebar, {
        records,
        currentIndex,
        onSelect: goTo,
        onlyUnedited,
        setOnlyUnedited,
      }),
      current
        ? h(Editor, {
            record: current,
            draft,
            setDraft,
            onSave: save,
            onPrev: goPrev,
            onNext: goNext,
            saveState,
            hasPrev: currentIndex > 0,
            hasNext: currentIndex < records.length - 1,
          })
        : h('div', { className: 'empty-state' }, 'No records.')
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(h(App));
