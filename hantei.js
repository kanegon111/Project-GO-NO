// ====== Chart.js dark theme defaults ======
Chart.defaults.color = '#cbd5e1';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';
Chart.defaults.font.family = "'Inter', 'Hiragino Kaku Gothic ProN', sans-serif";

// ====== 判定の閾値とスコア配分 ======
const THRESHOLDS = {
    ROI_EXCEPTIONAL: 200,      // ROIがこの値以上なら特例承認
    ROI_GOOD: 50,              // 通常Go判定のROI下限
    APPROVAL_HIGH: 80,         // 高賛同率（％）
    APPROVAL_MIN: 50,          // 過半数の境界（％）
    DURATION_MAX: 12,          // Go判定の期間上限（月）
    SCORE_PASS: 70,            // 総合スコアの合格点
};

const WEIGHTS = { roi: 0.4, approval: 0.3, duration: 0.15, effort: 0.15 };

// 判定結果ごとのスタイル（CSSクラス）
const STYLES = {
    go:     { panel: 'decision-go',     text: 'text-go',     icon: 'fa-circle-check icon-go' },
    nogo:   { panel: 'decision-nogo',   text: 'text-nogo',   icon: 'fa-circle-xmark icon-nogo' },
    review: { panel: 'decision-review', text: 'text-review', icon: 'fa-triangle-exclamation icon-review' },
};

// ====== DOM要素キャッシュ ======
const el = {
    inputs: {
        investment:  document.getElementById('input-investment'),
        expected:    document.getElementById('input-expected'),
        duration:    document.getElementById('input-duration'),
        effort:      document.getElementById('input-effort'),
        totalMgr:    document.getElementById('input-total-mgr'),
        approvedMgr: document.getElementById('input-approved-mgr'),
    },
    panel:           document.getElementById('decision-panel'),
    decisionIcon:    document.getElementById('decision-icon'),
    decisionText:    document.getElementById('decision-text'),
    decisionReason:  document.getElementById('decision-reason'),
    scoreText:       document.getElementById('score-text'),
    profitText:      document.getElementById('profit-text'),
    roiText:         document.getElementById('roi-text'),
    approvalText:    document.getElementById('approval-text'),
    approvalSubtext: document.getElementById('approval-subtext'),
};

// ====== グラフ初期化 ======
const barChart = new Chart(document.getElementById('barChart').getContext('2d'), {
    type: 'bar',
    data: {
        labels: ['投資額', '見込み額'],
        datasets: [{
            data: [0, 0],
            backgroundColor: ['rgba(251, 113, 133, 0.85)', 'rgba(52, 211, 153, 0.85)'],
            borderColor: ['rgba(251, 113, 133, 1)', 'rgba(52, 211, 153, 1)'],
            borderWidth: 1,
            borderRadius: 8,
        }],
    },
    options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        maintainAspectRatio: false,
        scales: {
            x: {
                beginAtZero: true,
                grid: { color: 'rgba(255, 255, 255, 0.06)' },
                ticks: { color: '#94a3b8' },
            },
            y: {
                grid: { display: false },
                ticks: { color: '#cbd5e1', font: { weight: '600' } },
            },
        },
    },
});

const pieChart = new Chart(document.getElementById('pieChart').getContext('2d'), {
    type: 'doughnut',
    data: {
        labels: ['賛同', '反対・保留'],
        datasets: [{
            data: [0, 0],
            backgroundColor: ['rgba(34, 211, 238, 0.95)', 'rgba(255, 255, 255, 0.08)'],
            borderWidth: 0,
        }],
    },
    options: {
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        cutout: '72%',
    },
});

// ====== 入力値の取得（負値は0に丸める） ======
function readInputs() {
    const num = (input) => Math.max(parseFloat(input.value) || 0, 0);
    const inv  = num(el.inputs.investment);
    const exp  = num(el.inputs.expected);
    const dur  = num(el.inputs.duration);
    const eff  = num(el.inputs.effort);
    const tMgr = num(el.inputs.totalMgr);
    let aMgr   = num(el.inputs.approvedMgr);

    // 賛同者が総数を超えないよう自動調整＋視覚フィードバック
    if (aMgr > tMgr) {
        aMgr = tMgr;
        el.inputs.approvedMgr.value = tMgr;
        el.inputs.approvedMgr.classList.add('input-warning');
        setTimeout(() => el.inputs.approvedMgr.classList.remove('input-warning'), 800);
    }
    return { inv, exp, dur, eff, tMgr, aMgr };
}

// ====== 総合スコアを算出 ======
function computeScore({ roi, approvalRate, dur, eff }) {
    // ROIを0〜200%の範囲で0〜100点に線形マッピング（マイナスは0点）
    const roiScore = Math.min(Math.max(roi, 0) / 2, 100);
    const durScore = Math.max(100 - (dur * 5), 0);
    const effScore = Math.max(100 - (eff * 2), 0);
    return Math.round(
        roiScore * WEIGHTS.roi +
        approvalRate * WEIGHTS.approval +
        durScore * WEIGHTS.duration +
        effScore * WEIGHTS.effort
    );
}

// ====== 判定ロジック ======
function decide({ roi, approvalRate, dur, totalScore, tMgr }) {
    if (approvalRate === 100 && tMgr > 0) {
        return { decision: 'Go', reason: '【特例承認】管理者全員の強い賛同があるため実行します。', style: STYLES.go };
    }
    if (roi >= THRESHOLDS.ROI_EXCEPTIONAL) {
        return { decision: 'Go', reason: `【特例承認】莫大なリターン(ROI ${THRESHOLDS.ROI_EXCEPTIONAL}%以上)が見込めるため実行します。`, style: STYLES.go };
    }
    if (approvalRate < THRESHOLDS.APPROVAL_MIN) {
        return { decision: 'No-Go', reason: '管理者の過半数の賛同が得られていません。', style: STYLES.nogo };
    }
    if (roi < 0) {
        return { decision: 'No-Go', reason: '投資対効果(ROI)がマイナスです。', style: STYLES.nogo };
    }
    if (approvalRate >= THRESHOLDS.APPROVAL_HIGH && roi >= THRESHOLDS.ROI_GOOD && dur <= THRESHOLDS.DURATION_MAX) {
        return { decision: 'Go', reason: '高い賛同率と十分なリターンが見込まれます。', style: STYLES.go };
    }
    if (totalScore >= THRESHOLDS.SCORE_PASS) {
        return { decision: 'Go', reason: `総合スコアが基準値(${THRESHOLDS.SCORE_PASS}点)を上回っています。`, style: STYLES.go };
    }
    return { decision: 'Review', reason: '指標にばらつきがあります。リスクとリターンを再討議してください。', style: STYLES.review };
}

// ====== 画面への反映 ======
function render({ inv, exp, profit, roi, approvalRate, aMgr, tMgr, totalScore, decision, reason, style }) {
    el.panel.className = `glass p-6 ${style.panel}`;
    el.decisionIcon.className = `fa-solid ${style.icon} text-3xl`;
    el.decisionText.textContent = decision;
    el.decisionText.className = `text-4xl md:text-5xl font-black ${style.text}`;
    el.decisionReason.textContent = reason;
    el.scoreText.textContent = totalScore;

    el.profitText.textContent = (profit >= 0 ? '+' : '') + profit.toLocaleString() + ' 万円';
    el.profitText.className = `text-2xl font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    el.roiText.textContent = roi.toFixed(1) + ' %';
    el.roiText.className = `text-2xl font-bold ${roi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

    el.approvalText.textContent = approvalRate.toFixed(0) + ' %';
    el.approvalSubtext.textContent = `${aMgr} / ${tMgr} 人`;

    barChart.data.datasets[0].data = [inv, exp];
    barChart.update();
    pieChart.data.datasets[0].data = [aMgr, Math.max(tMgr - aMgr, 0)];
    pieChart.update();
}

// ====== メイン処理 ======
function calculateAndUpdate() {
    const { inv, exp, dur, eff, tMgr, aMgr } = readInputs();

    const profit = exp - inv;
    const roi = inv > 0 ? (profit / inv) * 100 : 0;
    const approvalRate = tMgr > 0 ? (aMgr / tMgr) * 100 : 0;

    const totalScore = computeScore({ roi, approvalRate, dur, eff });
    const { decision, reason, style } = decide({ roi, approvalRate, dur, totalScore, tMgr });

    render({ inv, exp, profit, roi, approvalRate, aMgr, tMgr, totalScore, decision, reason, style });
}

// ====== イベント登録 & 初回計算 ======
Object.values(el.inputs).forEach((input) => input.addEventListener('input', calculateAndUpdate));
calculateAndUpdate();
