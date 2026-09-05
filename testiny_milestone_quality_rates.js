(() => {
  window.__testinyQualityRates?.stop?.();

  const state = { busy: false, lastPath: '', lastRefresh: 0, timer: null };
  const removeMetrics = () => {
    document
      .querySelectorAll('[data-testiny-quality-rate], [data-testiny-results-overview]')
      .forEach((node) => node.remove());
  };

  const resultDefinitions = [
    { key: 'FAILED', label: 'Failed', color: '#c40047', icon: '#icon-result-failed-12' },
    { key: 'BLOCKED', label: 'Blocked', color: '#ffc400', icon: '#icon-result-blocked-12' },
    { key: 'SKIPPED', label: 'Skipped', color: '#919191', icon: '#icon-result-skipped-12' },
    { key: 'PASSED', label: 'Passed', color: '#1eb397', icon: '#icon-result-passed-12' },
    { key: 'NOTRUN', label: 'Not Run', color: '#dee8ec', icon: '#icon-result-notrun-12' },
    { key: 'INPROGRESS', label: 'In Progress', color: '#00718c', icon: '#icon-result-inprogress-12' },
  ];

  const refresh = async () => {
    if (state.busy) return;

    const match = location.pathname.match(/\/milestones\/ms\/(\d+)/);
    if (!match) {
      removeMetrics();
      return;
    }

    const completionLabel = Array.from(document.querySelectorAll('label')).find(
      (label) => label.textContent.trim().toLowerCase() === 'completion rate',
    );
    if (!completionLabel) return;

    state.busy = true;
    try {
      const milestoneId = Number(match[1]);
      const milestoneResponse = await fetch(`/api/v1/milestone/${milestoneId}`);
      if (!milestoneResponse.ok) {
        throw new Error(`Milestone request failed: ${milestoneResponse.status}`);
      }
      const milestone = await milestoneResponse.json();

      const runQuery = {
        filter: { project_id: milestone.project_id },
        map: [
          {
            entities: ['testrun', 'milestone'],
            ids: { milestone_id: milestoneId },
          },
        ],
        pagination: { offset: 0, limit: 1000 },
      };
      const runResponse = await fetch(
        `/api/v1/testrun?q=${encodeURIComponent(JSON.stringify(runQuery))}`,
      );
      if (!runResponse.ok) {
        throw new Error(`Test-run request failed: ${runResponse.status}`);
      }
      const runs = (await runResponse.json()).data || [];

      let rows = [];
      if (runs.length) {
        const analysisResponse = await fetch(
          '/api/v1/analyze?l=tr_countTestCaseResults',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: 'tr_countTestCaseResults',
              tables: { tc_tr: ['testcases', 'testruns'] },
              aggr: { tc_tr: { testcase_id: 'count' } },
              filter: { 'tc_tr.testrun_id': runs.map((run) => run.id) },
              group: { tc_tr: ['result_status', 'testrun_id'] },
              projectId: milestone.project_id,
              allowCached: false,
            }),
          },
        );
        if (!analysisResponse.ok) {
          throw new Error(`Result analysis failed: ${analysisResponse.status}`);
        }
        rows = (await analysisResponse.json()).data || [];
      }

      const counts = rows.reduce((result, row) => {
        const status = row.tc_tr_result_status || 'UNKNOWN';
        result[status] =
          (result[status] || 0) + Number(row.tc_tr_testcase_id_count || 0);
        return result;
      }, {});
      const passed = counts.PASSED || 0;
      const failed = counts.FAILED || 0;
      const notRun = counts.NOTRUN || 0;
      const inProgress = counts.INPROGRESS || counts.IN_PROGRESS || 0;
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const completed = total - notRun - inProgress;
      const percentage = (count) =>
        completed ? `${((count / completed) * 100).toFixed(2)}%` : '-';
      const totalPercentage = (count) =>
        total ? `${((count / total) * 100).toFixed(2)}%` : '-';

      const template = completionLabel.parentElement.parentElement;
      const ribbon = template.parentElement;
      const completionRate = totalPercentage(completed);
      const completionTooltip =
        `Formula: Total executed / Total manual tests x 100\n` +
        `${completed} / ${total} x 100 = ${completionRate}`;
      const completionInfo = completionLabel.parentElement.querySelector('div');
      completionLabel.title = completionTooltip;
      if (completionInfo) {
        completionInfo.title = completionTooltip;
        completionInfo.setAttribute('aria-label', completionTooltip);
        completionInfo.style.cursor = 'help';
      }
      removeMetrics();

      const addMetric = (key, labelText, value, color, title) => {
        const metric = template.cloneNode(true);
        metric.dataset.testinyQualityRate = key;
        metric.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
        metric
          .querySelectorAll('[for]')
          .forEach((node) => node.removeAttribute('for'));
        metric.querySelectorAll('[data-testid],[data-aut]').forEach((node) => {
          node.removeAttribute('data-testid');
          node.removeAttribute('data-aut');
        });

        const label = metric.querySelector('label');
        label.textContent = labelText;
        label.title = title;
        const info = label.parentElement.querySelector('div');
        if (info) {
          info.title = title;
          info.setAttribute('aria-label', title);
          info.style.cursor = 'help';
        }

        const valueNode = metric.querySelector('span');
        valueNode.textContent = value;
        valueNode.style.color = color;
        valueNode.style.fontWeight = '700';
        valueNode.title = title;
        ribbon.appendChild(metric);
      };

      addMetric(
        'success',
        'Success rate',
        percentage(passed),
        '#16803c',
        `Formula: Passed / Total executed x 100\n` +
          `${passed} / ${completed} x 100 = ${percentage(passed)}`,
      );
      addMetric(
        'failure',
        'Failure rate',
        percentage(failed),
        '#c62828',
        `Formula: Failed / Total executed x 100\n` +
          `${failed} / ${completed} x 100 = ${percentage(failed)}`,
      );
      addMetric(
        'not-run',
        'Not run',
        totalPercentage(notRun),
        '#b26a00',
        `Formula: Not run / Total manual tests x 100\n` +
          `${notRun} / ${total} x 100 = ${totalPercentage(notRun)}`,
      );

      const overview = document.createElement('section');
      overview.dataset.testinyResultsOverview = '';
      overview.setAttribute('aria-label', 'Milestone test results overview');
      overview.innerHTML = `
        <style>
          [data-testiny-results-overview] {
            margin: 0 12px 16px;
            padding: 16px 20px;
            border: 1px solid rgba(34, 34, 34, 0.14);
            border-radius: 4px;
            background: var(--background-default, #fff);
            color: inherit;
          }
          [data-testiny-results-overview] .tq-heading {
            margin: 0 0 12px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
          }
          [data-testiny-results-overview] .tq-content {
            display: flex;
            align-items: center;
            gap: 28px;
            min-height: 150px;
          }
          [data-testiny-results-overview] .tq-chart {
            position: relative;
            flex: 0 0 150px;
            width: 150px;
            height: 150px;
          }
          [data-testiny-results-overview] .tq-chart svg {
            display: block;
            transform: rotate(-90deg);
          }
          [data-testiny-results-overview] .tq-center {
            position: absolute;
            inset: 0;
            display: grid;
            place-content: center;
            text-align: center;
            pointer-events: none;
          }
          [data-testiny-results-overview] .tq-center strong {
            font-size: 20px;
            line-height: 1.1;
          }
          [data-testiny-results-overview] .tq-center span {
            margin-top: 3px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
          }
          [data-testiny-results-overview] .tq-done {
            margin-top: 5px;
            font-size: 12px;
            text-align: center;
          }
          [data-testiny-results-overview] .tq-legend {
            display: grid;
            grid-template-columns: repeat(3, minmax(150px, 1fr));
            gap: 8px 18px;
            flex: 1;
          }
          [data-testiny-results-overview] .tq-result {
            display: grid;
            grid-template-columns: 58px 32px minmax(70px, 1fr);
            align-items: center;
            min-height: 30px;
          }
          [data-testiny-results-overview] .tq-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            min-width: 52px;
            height: 24px;
            padding: 0 5px;
            border-radius: 3px;
            color: #fff;
            font-size: 11px;
            font-weight: 700;
          }
          [data-testiny-results-overview] .tq-badge svg {
            width: 12px;
            height: 12px;
            fill: currentColor;
          }
          [data-testiny-results-overview] .tq-count {
            font-weight: 700;
            text-align: right;
          }
          [data-testiny-results-overview] .tq-label {
            margin-left: 9px;
            white-space: nowrap;
          }
          @media (max-width: 850px) {
            [data-testiny-results-overview] .tq-content {
              align-items: flex-start;
            }
            [data-testiny-results-overview] .tq-legend {
              grid-template-columns: repeat(2, minmax(150px, 1fr));
            }
          }
        </style>
        <h3 class="tq-heading">Milestone results</h3>
        <div class="tq-content">
          <div>
            <div class="tq-chart">
              <svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="Milestone result distribution">
                <circle cx="75" cy="75" r="61.25" fill="none" stroke="#eef2f4" stroke-width="17.5"></circle>
                <g class="tq-arcs"></g>
              </svg>
              <div class="tq-center">
                <strong>${totalPercentage(completed)}</strong>
                <span>complete</span>
              </div>
            </div>
            <div class="tq-done">${completed} of ${total} done</div>
          </div>
          <div class="tq-legend"></div>
        </div>
      `;

      const circumference = 2 * Math.PI * 61.25;
      let offset = 0;
      const arcs = overview.querySelector('.tq-arcs');
      const legend = overview.querySelector('.tq-legend');
      for (const definition of resultDefinitions) {
        const count = definition.key === 'INPROGRESS'
          ? inProgress
          : counts[definition.key] || 0;
        const fraction = total ? count / total : 0;
        if (count) {
          const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          arc.setAttribute('cx', '75');
          arc.setAttribute('cy', '75');
          arc.setAttribute('r', '61.25');
          arc.setAttribute('fill', 'none');
          arc.setAttribute('stroke', definition.color);
          arc.setAttribute('stroke-width', '17.5');
          arc.setAttribute('stroke-dasharray', `${fraction * circumference} ${circumference}`);
          arc.setAttribute('stroke-dashoffset', `${-offset * circumference}`);
          arc.setAttribute('data-result', definition.key);
          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent = `${definition.label}: ${count} (${totalPercentage(count)})`;
          arc.appendChild(title);
          arcs.appendChild(arc);
          offset += fraction;
        }

        const result = document.createElement('div');
        result.className = 'tq-result';
        result.title = `${definition.label}: ${count} of ${total} manual tests`;
        const darkText = definition.key === 'BLOCKED' || definition.key === 'NOTRUN';
        result.innerHTML = `
          <span class="tq-badge" style="background:${definition.color};color:${darkText ? '#222' : '#fff'}">
            <svg viewBox="0 0 12 12" aria-hidden="true"><use href="${definition.icon}"></use></svg>
            ${totalPercentage(count)}
          </span>
          <span class="tq-count">${count || '-'}</span>
          <span class="tq-label">${definition.label}</span>
        `;
        legend.appendChild(result);
      }

      ribbon.parentElement.insertAdjacentElement('afterend', overview);

      state.lastPath = location.pathname;
      state.lastRefresh = Date.now();
    } catch (error) {
      console.error('Testiny quality rates:', error);
    } finally {
      state.busy = false;
    }
  };

  state.timer = setInterval(() => {
    const metricsMissing =
      document.querySelectorAll('[data-testiny-quality-rate]').length !== 3;
    const overviewMissing =
      document.querySelectorAll('[data-testiny-results-overview]').length !== 1;
    const routeChanged = state.lastPath !== location.pathname;
    const stale = Date.now() - state.lastRefresh > 30000;
    if (metricsMissing || overviewMissing || routeChanged || stale) refresh();
  }, 1000);

  state.stop = () => {
    clearInterval(state.timer);
    removeMetrics();
  };
  window.__testinyQualityRates = state;
  refresh();
})();
