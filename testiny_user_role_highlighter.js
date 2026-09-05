(() => {
  window.__testinyRoleHighlighter?.stop?.();

  const classes = [
    'testiny-role-admin',
    'testiny-role-editor',
    'testiny-role-tester',
    'testiny-role-viewer',
    'testiny-role-no-access',
  ];
  const state = { observer: null, scheduled: false, style: null };

  const style = document.createElement('style');
  style.id = 'testiny-role-highlighter-style';
  style.textContent = `
    tbody tr.testiny-role-admin {
      background: #f3e8ff !important;
      box-shadow: inset 5px 0 #9333ea !important;
    }
    tbody tr.testiny-role-editor {
      background: #fff3cd !important;
      box-shadow: inset 5px 0 #f59e0b !important;
    }
    tbody tr.testiny-role-tester {
      background: #e0f2fe !important;
      box-shadow: inset 5px 0 #0284c7 !important;
    }
    tbody tr.testiny-role-viewer {
      background: #ecfdf5 !important;
      box-shadow: inset 5px 0 #16a34a !important;
    }
    tbody tr.testiny-role-no-access {
      opacity: 0.35 !important;
    }
  `;
  document.head.appendChild(style);
  state.style = style;

  const findUsersTable = () =>
    Array.from(document.querySelectorAll('table')).find((table) =>
      Array.from(table.querySelectorAll('th, [role="columnheader"]')).some(
        (header) => header.textContent.trim().toLowerCase() === 'effective role',
      ),
    );

  const highlightRows = () => {
    state.scheduled = false;

    const table = findUsersTable();
    if (!table) return;

    const headers = Array.from(
      table.querySelectorAll('thead th, thead [role="columnheader"]'),
    );
    const effectiveRoleIndex = headers.findIndex(
      (header) => header.textContent.trim().toLowerCase() === 'effective role',
    );
    if (effectiveRoleIndex < 0) return;

    table.querySelectorAll('tbody tr, tbody [role="row"]').forEach((row) => {
      row.classList.remove(...classes);

      const cells = Array.from(row.querySelectorAll('td, [role="cell"]'));
      const effectiveRole = cells[effectiveRoleIndex]?.textContent
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (!effectiveRole) return;

      if (effectiveRole === 'no access') {
        row.classList.add('testiny-role-no-access');
      } else if (
        effectiveRole.includes('administrator') ||
        effectiveRole.includes('owner')
      ) {
        row.classList.add('testiny-role-admin');
      } else if (effectiveRole.includes('editor')) {
        row.classList.add('testiny-role-editor');
      } else if (
        effectiveRole.includes('tester') ||
        effectiveRole.includes('executor')
      ) {
        row.classList.add('testiny-role-tester');
      } else if (effectiveRole.includes('viewer')) {
        row.classList.add('testiny-role-viewer');
      }
    });
  };

  const scheduleHighlight = () => {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(highlightRows);
  };

  state.observer = new MutationObserver(scheduleHighlight);
  state.observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  state.stop = () => {
    state.observer?.disconnect();
    state.style?.remove();
    document.querySelectorAll('tbody tr, tbody [role="row"]').forEach((row) => {
      row.classList.remove(...classes);
    });
    delete window.__testinyRoleHighlighter;
  };

  window.__testinyRoleHighlighter = state;
  highlightRows();
})();
