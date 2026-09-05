(() => {
  window.__testinyQualityRates?.stop?.();

  const state = { busy: false, lastPath: '', lastRefresh: 0, timer: null };
  const removeMetrics = () => {
    document
      .querySelectorAll('[data-testiny-quality-rate]')
      .forEach((node) => node.remove());
  };

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
      const executedPercentage = (count) =>
        completed ? `${((count / completed) * 100).toFixed(2)}%` : '-';
      const totalPercentage = (count) =>
        total ? `${((count / total) * 100).toFixed(2)}%` : '-';

      const template = completionLabel.parentElement.parentElement;
      const ribbon = template.parentElement;
      const completionRate = totalPercentage(completed);
      const completionTooltip =
        `Formula: Total executed / Total manual tests x 100\n` +
        `${completed} / ${total} x 100 = ${completionRate}`;
      completionLabel.title = completionTooltip;
      const completionInfo = completionLabel.parentElement.querySelector('div');
      if (completionInfo) {
        completionInfo.title = completionTooltip;
        completionInfo.setAttribute('aria-label', completionTooltip);
        completionInfo.style.cursor = 'help';
      }

      removeMetrics();

      const addMetric = (key, labelText, value, color, tooltip) => {
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
        label.title = tooltip;
        const info = label.parentElement.querySelector('div');
        if (info) {
          info.title = tooltip;
          info.setAttribute('aria-label', tooltip);
          info.style.cursor = 'help';
        }

        const valueNode = metric.querySelector('span');
        valueNode.textContent = value;
        valueNode.style.color = color;
        valueNode.style.fontWeight = '700';
        valueNode.title = tooltip;
        ribbon.appendChild(metric);
      };

      addMetric(
        'success',
        'Success rate',
        executedPercentage(passed),
        '#16803c',
        `Formula: Passed / Total executed x 100\n` +
          `${passed} / ${completed} x 100 = ${executedPercentage(passed)}`,
      );
      addMetric(
        'failure',
        'Failure rate',
        executedPercentage(failed),
        '#c62828',
        `Formula: Failed / Total executed x 100\n` +
          `${failed} / ${completed} x 100 = ${executedPercentage(failed)}`,
      );
      addMetric(
        'not-run',
        'Not run',
        totalPercentage(notRun),
        '#b26a00',
        `Formula: Not run / Total manual tests x 100\n` +
          `${notRun} / ${total} x 100 = ${totalPercentage(notRun)}`,
      );

      state.lastPath = location.pathname;
      state.lastRefresh = Date.now();
    } catch (error) {
      console.error('Testiny milestone ribbon rates:', error);
    } finally {
      state.busy = false;
    }
  };

  state.timer = setInterval(() => {
    const metricsMissing =
      document.querySelectorAll('[data-testiny-quality-rate]').length !== 3;
    const routeChanged = state.lastPath !== location.pathname;
    const stale = Date.now() - state.lastRefresh > 30000;
    if (metricsMissing || routeChanged || stale) refresh();
  }, 1000);

  state.stop = () => {
    clearInterval(state.timer);
    removeMetrics();
    delete window.__testinyQualityRates;
  };

  window.__testinyQualityRates = state;
  refresh();
})();
