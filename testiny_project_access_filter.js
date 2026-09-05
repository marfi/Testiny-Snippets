(() => {
  window.__testinyAccessFilter?.stop?.();

  const state = {
    busy: false,
    lastPath: '',
    lastRefresh: 0,
    timer: null,
    original: null,
  };

  const roleDefinitions = {
    Owner: { label: 'Owner', rank: 100, color: '#6b21a8', roleId: null },
    TenantAdmin: {
      label: 'Administrator', rank: 90, color: '#7e22ce', roleId: null,
    },
    ProjectAdmin: {
      label: 'Project Administrator', rank: 80, color: '#9333ea', roleId: 280,
    },
    ProjectEditor: { label: 'Editor', rank: 70, color: '#c2410c', roleId: 303 },
    ProjectRunEditor: {
      label: 'Run Manager', rank: 60, color: '#0369a1', roleId: 304,
    },
    'Run Tester': {
      label: 'Run Tester', rank: 50, color: '#0369a1', roleId: 307,
    },
    ProjectRunExecutor: {
      label: 'Run Executor', rank: 40, color: '#0369a1', roleId: 290,
    },
    ProjectViewer: { label: 'Viewer', rank: 10, color: '#15803d', roleId: 305 },
  };

  const editableRoles = Object.values(roleDefinitions)
    .filter((role) => role.roleId)
    .sort((left, right) => left.rank - right.rank);

  const removeDashboard = () => {
    document.querySelector('[data-testiny-access-dashboard]')?.remove();
    state.original?.removeAttribute('data-testiny-original-users');
    state.original = null;
  };

  const findUsersTable = () =>
    Array.from(document.querySelectorAll('table')).find((table) =>
      Array.from(table.querySelectorAll('th, [role="columnheader"]')).some(
        (header) => header.textContent.trim().toLowerCase() === 'effective role',
      ),
    );

  const fetchProfiles = async () => {
    const profiles = [];
    const limit = 200;
    let total = Infinity;

    while (profiles.length < total) {
      const query = {
        pagination: { offset: profiles.length, limit },
        order: [{ column: 'display_name', order: 'asc' }],
        includeTotalCount: true,
        omitLargeValues: true,
      };
      const response = await fetch(
        `/api/v1/user-profile?q=${encodeURIComponent(JSON.stringify(query))}`,
      );
      if (!response.ok) {
        throw new Error(`User profiles request failed: ${response.status}`);
      }
      const result = await response.json();
      const batch = result.data || [];
      profiles.push(...batch);
      total = result.meta?.totalCount ?? profiles.length;
      if (!batch.length) break;
    }

    return profiles;
  };

  const addAssignment = (assignments, userId, roleName) => {
    const definition = roleDefinitions[roleName];
    if (!definition) return;
    const key = String(userId);
    const current = assignments.get(key);
    if (!current || definition.rank > current.rank) {
      assignments.set(key, { ...definition, roleName });
    }
  };

  const saveDirectRole = async (user, roleId, controls) => {
    controls.select.disabled = true;
    controls.button.disabled = true;
    controls.button.textContent = 'Saving';
    controls.message.textContent = '';

    try {
      const response = await fetch('/api/v1/permission/user-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: user.id,
          projectRoles: [
            {
              projectId: user.projectId,
              roleIds: roleId ? [roleId] : [],
            },
          ],
          resetRoles: false,
          disableQuotaCheck: false,
        }),
      });
      if (!response.ok) {
        throw new Error(`Role update failed: ${response.status}`);
      }

      controls.message.textContent = 'Saved';
      controls.message.className = 'ta-message ta-message-ok';
      state.lastRefresh = 0;
      await refresh();
    } catch (error) {
      controls.select.disabled = false;
      controls.button.textContent = 'Save';
      controls.message.textContent = error.message;
      controls.message.className = 'ta-message ta-message-error';
      console.error('Testiny role update:', error);
    }
  };

  const createCard = (user) => {
    const card = document.createElement('div');
    card.className = 'ta-user';
    card.title =
      `${user.name}\n${user.email}\nEffective: ${user.role.label}` +
      `${user.inheritedRole ? `\nInherited: ${user.inheritedRole.label}` : ''}`;

    const name = document.createElement('span');
    name.className = 'ta-name';
    name.textContent = user.name;

    const badge = document.createElement('span');
    badge.className = 'ta-role';
    badge.style.setProperty('--ta-role-color', user.role.color);
    badge.textContent = user.role.label;

    const detail = document.createElement('span');
    detail.className = 'ta-detail';
    detail.textContent = user.email;

    const status = document.createElement('span');
    status.className = `ta-status ta-status-${user.status.toLowerCase()}`;
    status.textContent = user.status;

    const editor = document.createElement('div');
    editor.className = 'ta-editor';

    if (user.editable) {
      const select = document.createElement('select');
      select.className = 'ta-select';
      select.title = 'Direct project role';

      const noDirectRole = document.createElement('option');
      noDirectRole.value = '';
      noDirectRole.textContent = user.inheritedRole ? 'No direct role' : 'No access';
      select.appendChild(noDirectRole);
      editableRoles.forEach((role) => {
        const option = document.createElement('option');
        option.value = String(role.roleId);
        option.textContent = role.label;
        select.appendChild(option);
      });
      select.value = user.directRole?.roleId ? String(user.directRole.roleId) : '';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ta-save';
      button.textContent = 'Save';
      button.disabled = true;

      const message = document.createElement('span');
      message.className = 'ta-message';

      const originalValue = select.value;
      select.addEventListener('change', () => {
        button.disabled = select.value === originalValue;
        message.textContent = '';
      });
      button.addEventListener('click', () => {
        const roleId = select.value ? Number(select.value) : null;
        saveDirectRole(user, roleId, { select, button, message });
      });

      editor.append(select, button, message);
    } else {
      const locked = document.createElement('span');
      locked.className = 'ta-locked';
      locked.textContent = 'Managed at organization level';
      editor.appendChild(locked);
    }

    card.append(name, badge, detail, status, editor);
    return card;
  };

  const refresh = async () => {
    if (state.busy) return;

    const projectId = Number(location.pathname.match(/\/projects\/pr\/(\d+)/)?.[1]);
    const table = findUsersTable();
    if (!projectId || !table) {
      removeDashboard();
      return;
    }

    state.busy = true;
    try {
      const [userPermissions, groupPermissions, profiles] = await Promise.all([
        fetch('/api/v1/permission/users/roles').then((response) => response.json()),
        fetch('/api/v1/permission/groups/roles').then((response) => response.json()),
        fetchProfiles(),
      ]);

      const rolesById = new Map(
        (userPermissions.roles || []).map((role) => [role.id, role.name]),
      );
      const assignments = new Map();
      const directAssignments = new Map();
      const inheritedAssignments = new Map();

      for (const [userId, roles] of Object.entries(userPermissions.userRoles || {})) {
        for (const assignment of roles) {
          const roleName = rolesById.get(assignment.role_id);
          const appliesToProject = assignment.project_id === projectId;
          const appliesToTenant =
            assignment.project_id === 0 && roleName === 'TenantAdmin';
          if (appliesToProject || appliesToTenant) {
            addAssignment(assignments, userId, roleName);
          }
          if (appliesToProject && roleDefinitions[roleName]) {
            directAssignments.set(String(userId), roleDefinitions[roleName]);
          }
        }
      }

      addAssignment(assignments, userPermissions.tenantOwnerUserId, 'Owner');

      const usersByGroup = new Map();
      for (const membership of groupPermissions.groupUsers || []) {
        if (!usersByGroup.has(membership.group_id)) {
          usersByGroup.set(membership.group_id, []);
        }
        usersByGroup.get(membership.group_id).push(membership.user_id);
      }
      for (const assignment of groupPermissions.groupRoles || []) {
        if (assignment.project_id !== projectId) continue;
        const roleName = rolesById.get(assignment.role_id);
        for (const userId of usersByGroup.get(assignment.group_id) || []) {
          addAssignment(assignments, userId, roleName);
          addAssignment(inheritedAssignments, userId, roleName);
        }
      }

      const users = profiles
        .filter((profile) => !profile.is_deleted)
        .map((profile) => {
          const role = assignments.get(String(profile.user_id));
          if (!role) return null;
          const status = profile.is_active
            ? profile.is_invite_pending
              ? 'Invited'
              : 'Active'
            : 'Inactive';
          return {
            id: profile.user_id,
            projectId,
            name: profile.display_name || profile.email,
            email: profile.email || '',
            role,
            directRole: directAssignments.get(String(profile.user_id)) || null,
            inheritedRole:
              inheritedAssignments.get(String(profile.user_id)) || null,
            editable:
              role.roleName !== 'Owner' && role.roleName !== 'TenantAdmin',
            status,
          };
        })
        .filter(Boolean)
        .sort(
          (left, right) =>
            right.role.rank - left.role.rank ||
            left.name.localeCompare(right.name),
        );

      const elevated = users.filter((user) => user.role.rank > 10);
      const viewers = users.filter((user) => user.role.rank === 10);

      removeDashboard();

      const original = table.parentElement?.parentElement?.parentElement;
      if (!original) throw new Error('Users table container not found');
      original.dataset.testinyOriginalUsers = '';
      state.original = original;

      const dashboard = document.createElement('section');
      dashboard.dataset.testinyAccessDashboard = '';
      dashboard.innerHTML = `
        <style>
          [data-testiny-original-users] { display: none !important; }
          [data-testiny-access-dashboard] {
            margin-top: 12px; padding-bottom: 56px; color: inherit;
          }
          [data-testiny-access-dashboard] .ta-summary {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; margin-bottom: 10px;
          }
          [data-testiny-access-dashboard] .ta-title { font-size: 13px; font-weight: 700; }
          [data-testiny-access-dashboard] .ta-counts { font-size: 12px; opacity: .72; }
          [data-testiny-access-dashboard] .ta-heading {
            margin: 10px 0 6px; font-size: 11px; font-weight: 700;
            text-transform: uppercase;
          }
          [data-testiny-access-dashboard] .ta-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
            gap: 5px;
          }
          [data-testiny-access-dashboard] .ta-user {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-areas: 'name role' 'detail status' 'editor editor';
            align-items: center; column-gap: 6px; min-height: 62px;
            padding: 4px 7px; border: 1px solid rgba(34,34,34,.12);
            border-radius: 4px; background: var(--background-default, #fff);
            overflow: hidden;
          }
          [data-testiny-access-dashboard] .ta-name {
            grid-area: name; overflow: hidden; font-size: 12px; font-weight: 600;
            text-overflow: ellipsis; white-space: nowrap;
          }
          [data-testiny-access-dashboard] .ta-role {
            grid-area: role; color: var(--ta-role-color); font-size: 10px;
            font-weight: 700; white-space: nowrap;
          }
          [data-testiny-access-dashboard] .ta-detail {
            grid-area: detail; overflow: hidden; font-size: 10px; opacity: .65;
            text-overflow: ellipsis; white-space: nowrap;
          }
          [data-testiny-access-dashboard] .ta-status {
            grid-area: status; font-size: 9px; font-weight: 700;
          }
          [data-testiny-access-dashboard] .ta-editor {
            grid-area: editor; display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center; gap: 4px; margin-top: 3px;
          }
          [data-testiny-access-dashboard] .ta-select {
            min-width: 0; height: 24px; padding: 0 4px;
            border: 1px solid rgba(34,34,34,.25); border-radius: 3px;
            background: inherit; color: inherit; font-size: 10px;
          }
          [data-testiny-access-dashboard] .ta-save {
            height: 24px; padding: 0 7px; border: 0; border-radius: 3px;
            background: #00718c; color: #fff; font-size: 10px;
            font-weight: 700; cursor: pointer;
          }
          [data-testiny-access-dashboard] .ta-save:disabled {
            opacity: .38; cursor: default;
          }
          [data-testiny-access-dashboard] .ta-message {
            grid-column: 1 / -1; overflow: hidden;
            font-size: 9px; text-overflow: ellipsis; white-space: nowrap;
          }
          [data-testiny-access-dashboard] .ta-message-ok { color: #15803d; }
          [data-testiny-access-dashboard] .ta-message-error { color: #9f1239; }
          [data-testiny-access-dashboard] .ta-locked {
            grid-column: 1 / -1; font-size: 9px; opacity: .55;
          }
          [data-testiny-access-dashboard] .ta-status-active { color: #15803d; }
          [data-testiny-access-dashboard] .ta-status-invited { color: #0369a1; }
          [data-testiny-access-dashboard] .ta-status-inactive { color: #9f1239; }
        </style>
        <div class="ta-summary">
          <span class="ta-title">Users with project access</span>
          <span class="ta-counts"></span>
        </div>
        <h3 class="ta-heading">Elevated access</h3>
        <div class="ta-grid ta-elevated"></div>
        <h3 class="ta-heading">Viewers</h3>
        <div class="ta-grid ta-viewers"></div>
      `;

      dashboard.querySelector('.ta-counts').textContent =
        `${users.length} total - ${elevated.length} elevated - ${viewers.length} viewers`;
      elevated.forEach((user) =>
        dashboard.querySelector('.ta-elevated').appendChild(createCard(user)),
      );
      viewers.forEach((user) =>
        dashboard.querySelector('.ta-viewers').appendChild(createCard(user)),
      );

      original.insertAdjacentElement('beforebegin', dashboard);
      state.lastPath = location.pathname;
      state.lastRefresh = Date.now();
    } catch (error) {
      console.error('Testiny access-only users:', error);
    } finally {
      state.busy = false;
    }
  };

  state.timer = setInterval(() => {
    const routeChanged = state.lastPath !== location.pathname;
    const dashboardMissing = !document.querySelector(
      '[data-testiny-access-dashboard]',
    );
    const stale = Date.now() - state.lastRefresh > 30000;
    if (routeChanged || dashboardMissing || stale) refresh();
  }, 1000);

  state.stop = () => {
    clearInterval(state.timer);
    removeDashboard();
    delete window.__testinyAccessFilter;
  };

  window.__testinyAccessFilter = state;
  refresh();
})();
