import pool from '../db/index';

// ─── THRESHOLDS ───────────────────────────────────────────────
const THRESHOLDS = {
  highTxVolume: 500,       // "high activity" if >500 TXs in window
  mediumTxVolume: 100,
  highFailRate: 0.1,       // >10% fail rate = "notable failures"
  highGas: 100_000,        // avg gas per tx considered high
  frequentSender: 50,      // top sender with >50 TXs = "power user"
  highEventDiversity: 10,  // distinct event types = "diverse activity"
};

// ─── DATA FETCH ───────────────────────────────────────────────

async function fetchSnapshot(windowHours: number) {
  const interval = `${windowHours} hours`;

  const [totalTx, successTx, failTx, totalEvents, topSenders, topEventTypes, gasStats, latestBlock, recentTx] =
    await Promise.all([
      // Total TXs in window
      pool.query(
        `SELECT COUNT(*) as count FROM transactions WHERE timestamp > NOW() - INTERVAL '${interval}'`
      ),
      // Successful TXs in window
      pool.query(
        `SELECT COUNT(*) as count FROM transactions WHERE success = true AND timestamp > NOW() - INTERVAL '${interval}'`
      ),
      // Failed TXs in window
      pool.query(
        `SELECT COUNT(*) as count FROM transactions WHERE success = false AND timestamp > NOW() - INTERVAL '${interval}'`
      ),
      // Total events in window
      pool.query(
        `SELECT COUNT(*) as count FROM events e JOIN transactions t ON e.transaction_version = t.version WHERE t.timestamp > NOW() - INTERVAL '${interval}'`
      ),
      // Top senders
      pool.query(
        `SELECT sender, COUNT(*) as count FROM transactions WHERE sender IS NOT NULL AND timestamp > NOW() - INTERVAL '${interval}' GROUP BY sender ORDER BY count DESC LIMIT 5`
      ),
      // Top event types
      pool.query(
        `SELECT e.type, COUNT(*) as count FROM events e JOIN transactions t ON e.transaction_version = t.version WHERE t.timestamp > NOW() - INTERVAL '${interval}' GROUP BY e.type ORDER BY count DESC LIMIT 8`
      ),
      // Gas stats
      pool.query(
        `SELECT AVG(gas_used) as avg_gas, MAX(gas_used) as max_gas, SUM(gas_used) as total_gas FROM transactions WHERE timestamp > NOW() - INTERVAL '${interval}'`
      ),
      // Latest block
      pool.query('SELECT last_processed_version FROM indexer_state WHERE id = 1'),
      // Most recent few TXs
      pool.query(
        `SELECT version, hash, sender, success, gas_used, timestamp FROM transactions ORDER BY version DESC LIMIT 3`
      )
    ]);

  return {
    window: windowHours,
    totalTx: parseInt(totalTx.rows[0].count, 10),
    successTx: parseInt(successTx.rows[0].count, 10),
    failTx: parseInt(failTx.rows[0].count, 10),
    totalEvents: parseInt(totalEvents.rows[0].count, 10),
    topSenders: topSenders.rows,
    topEventTypes: topEventTypes.rows,
    avgGas: parseFloat(gasStats.rows[0].avg_gas) || 0,
    maxGas: parseInt(gasStats.rows[0].max_gas, 10) || 0,
    totalGas: parseInt(gasStats.rows[0].total_gas, 10) || 0,
    latestBlock: parseInt(latestBlock.rows[0]?.last_processed_version, 10) || 0,
    recentTx: recentTx.rows,
  };
}

// ─── RULE ENGINE ──────────────────────────────────────────────

function analyzeActivity(data: Awaited<ReturnType<typeof fetchSnapshot>>) {
  const insights: string[] = [];
  const highlights: string[] = [];
  const warnings: string[] = [];
  const raw = data;

  const failRate = data.totalTx > 0 ? data.failTx / data.totalTx : 0;
  const successRate = 1 - failRate;
  const eventsPerTx = data.totalTx > 0 ? data.totalEvents / data.totalTx : 0;
  const eventTypeCount = data.topEventTypes.length;
  const topSender = data.topSenders[0];
  const topEvent = data.topEventTypes[0];

  // ── VOLUME ASSESSMENT ──
  if (data.totalTx === 0) {
    insights.push(`No transactions were recorded in the last ${data.window} hour(s). The network may be quiet or indexing is still catching up.`);
  } else if (data.totalTx >= THRESHOLDS.highTxVolume) {
    insights.push(`🔥 **High activity detected**: ${data.totalTx.toLocaleString()} transactions processed in the last ${data.window}h — the network is very busy.`);
  } else if (data.totalTx >= THRESHOLDS.mediumTxVolume) {
    insights.push(`📈 **Moderate activity**: ${data.totalTx.toLocaleString()} transactions in the last ${data.window}h — steady traffic on the network.`);
  } else {
    insights.push(`📉 **Low activity**: Only ${data.totalTx.toLocaleString()} transaction(s) in the last ${data.window}h — the network is quiet.`);
  }

  // ── SUCCESS RATE ──
  if (data.totalTx > 0) {
    if (failRate > THRESHOLDS.highFailRate) {
      warnings.push(`⚠️ **Elevated failure rate**: ${(failRate * 100).toFixed(1)}% of transactions failed (${data.failTx} out of ${data.totalTx}). Investigate potential smart contract bugs or invalid parameters.`);
    } else if (data.failTx > 0) {
      insights.push(`✅ Success rate is healthy at ${(successRate * 100).toFixed(1)}% — ${data.failTx} minor failure(s) recorded.`);
    } else {
      highlights.push(`✅ Perfect execution: all ${data.totalTx.toLocaleString()} transactions succeeded with no failures.`);
    }
  }

  // ── GAS USAGE ──
  if (data.avgGas > 0) {
    if (data.avgGas >= THRESHOLDS.highGas) {
      warnings.push(`⛽ **High gas consumption**: average of ${Math.round(data.avgGas).toLocaleString()} gas per transaction. This may indicate complex smart contract interactions.`);
    } else if (data.avgGas > 0) {
      insights.push(`⛽ Gas usage is efficient — average ${Math.round(data.avgGas).toLocaleString()} gas per transaction (max: ${data.maxGas.toLocaleString()}).`);
    }
  }

  // ── EVENT ACTIVITY ──
  if (data.totalEvents > 0) {
    if (eventsPerTx > 3) {
      highlights.push(`⚡ **Rich event activity**: ${data.totalEvents.toLocaleString()} events fired — averaging ${eventsPerTx.toFixed(1)} events per transaction, suggesting complex multi-step operations.`);
    } else {
      insights.push(`⚡ ${data.totalEvents.toLocaleString()} event(s) emitted across all transactions (${eventsPerTx.toFixed(1)} per tx).`);
    }
  }

  // ── EVENT TYPE DIVERSITY ──
  if (eventTypeCount >= THRESHOLDS.highEventDiversity) {
    insights.push(`🌐 **Diverse on-chain activity**: ${eventTypeCount} distinct event types detected — indicating varied smart contract usage.`);
  } else if (eventTypeCount > 1) {
    insights.push(`🌐 ${eventTypeCount} distinct event types observed on-chain.`);
  }

  // ── TOP EVENT TYPE ──
  if (topEvent) {
    const shortType = topEvent.type.split('::').slice(-2).join('::');
    highlights.push(`🏆 **Most common event**: \`${shortType}\` fired ${parseInt(topEvent.count, 10).toLocaleString()} time(s) — this module is the dominant activity driver.`);
  }

  // ── TOP SENDER (POWER USER) ──
  if (topSender && parseInt(topSender.count, 10) >= THRESHOLDS.frequentSender) {
    const shortAddr = topSender.sender.slice(0, 6) + '...' + topSender.sender.slice(-4);
    highlights.push(`👤 **Power user detected**: Address \`${shortAddr}\` sent ${parseInt(topSender.count, 10).toLocaleString()} transactions — driving a disproportionate share of network activity.`);
  } else if (topSender) {
    const shortAddr = topSender.sender.slice(0, 6) + '...' + topSender.sender.slice(-4);
    insights.push(`👤 Top sender: \`${shortAddr}\` with ${parseInt(topSender.count, 10).toLocaleString()} transaction(s).`);
  }

  // ── BLOCK HEIGHT ──
  if (data.latestBlock > 0) {
    insights.push(`📦 Indexer is synced up to block **${data.latestBlock.toLocaleString()}**.`);
  }

  return { insights, highlights, warnings, raw };
}

// ─── NATURAL LANGUAGE SUMMARY ─────────────────────────────────

function buildSummary(analyzed: ReturnType<typeof analyzeActivity>, windowHours: number): string {
  const { insights, highlights, warnings } = analyzed;
  const data = analyzed.raw;
  const failRate = data.totalTx > 0 ? (data.failTx / data.totalTx * 100).toFixed(1) : '0.0';
  const successRate = data.totalTx > 0 ? ((data.successTx / data.totalTx) * 100).toFixed(1) : '100.0';

  let summary = `## 🤖 On-Chain Activity Report — Last ${windowHours}h\n\n`;

  // Headline paragraph
  if (data.totalTx === 0) {
    summary += `The Endless network appears quiet — no transactions were indexed in the last ${windowHours} hour(s). The indexer is operational and will report activity as blocks are processed.\n\n`;
  } else {
    const activityLevel = data.totalTx >= THRESHOLDS.highTxVolume ? 'high' :
                          data.totalTx >= THRESHOLDS.mediumTxVolume ? 'moderate' : 'low';

    summary += `The Endless network is showing **${activityLevel} activity** over the past ${windowHours} hour(s). `;
    summary += `A total of **${data.totalTx.toLocaleString()} transactions** were processed, `;
    summary += `of which ${successRate}% succeeded`;
    if (data.failTx > 0) {
      summary += ` and ${failRate}% failed`;
    }
    summary += `. These transactions emitted **${data.totalEvents.toLocaleString()} events** across ${analyzed.raw.topEventTypes.length} distinct event type(s).\n\n`;
  }

  // Highlights
  if (highlights.length > 0) {
    summary += `### 🌟 Highlights\n`;
    highlights.forEach(h => summary += `- ${h}\n`);
    summary += '\n';
  }

  // Warnings
  if (warnings.length > 0) {
    summary += `### ⚠️ Attention\n`;
    warnings.forEach(w => summary += `- ${w}\n`);
    summary += '\n';
  }

  // Insights
  if (insights.length > 0) {
    summary += `### 📊 Details\n`;
    insights.forEach(i => summary += `- ${i}\n`);
    summary += '\n';
  }

  // Top event types breakdown
  if (data.topEventTypes.length > 0) {
    summary += `### 🔬 Event Breakdown\n`;
    summary += `| Event Type | Count |\n|---|---|\n`;
    data.topEventTypes.forEach(et => {
      const short = et.type.length > 50 ? '…' + et.type.slice(-48) : et.type;
      summary += `| \`${short}\` | ${parseInt(et.count, 10).toLocaleString()} |\n`;
    });
    summary += '\n';
  }

  // Top senders
  if (data.topSenders.length > 0) {
    summary += `### 👥 Top Senders\n`;
    data.topSenders.forEach((s, i) => {
      const shortAddr = s.sender.slice(0, 10) + '...' + s.sender.slice(-6);
      summary += `${i + 1}. \`${shortAddr}\` — ${parseInt(s.count, 10).toLocaleString()} tx\n`;
    });
    summary += '\n';
  }

  summary += `---\n*Generated by rule-based on-chain analyzer · ${new Date().toUTCString()}*`;
  return summary;
}

// ─── PUBLIC API ───────────────────────────────────────────────

export interface AnalyzeResult {
  window_hours: number;
  generated_at: string;
  summary: string;
  data: {
    total_transactions: number;
    success_transactions: number;
    failed_transactions: number;
    success_rate_pct: string;
    total_events: number;
    events_per_tx: string;
    avg_gas: number;
    max_gas: number;
    latest_block: number;
    top_senders: Array<{ sender: string; count: number }>;
    top_event_types: Array<{ type: string; count: number }>;
  };
  highlights: string[];
  warnings: string[];
  insights: string[];
}

export async function analyzeOnChainActivity(windowHours = 24): Promise<AnalyzeResult> {
  const snapshot = await fetchSnapshot(windowHours);
  const analyzed = analyzeActivity(snapshot);
  const summary = buildSummary(analyzed, windowHours);

  const failRate = snapshot.totalTx > 0 ? (snapshot.successTx / snapshot.totalTx * 100) : 100;
  const eventsPerTx = snapshot.totalTx > 0 ? (snapshot.totalEvents / snapshot.totalTx) : 0;

  return {
    window_hours: windowHours,
    generated_at: new Date().toISOString(),
    summary,
    data: {
      total_transactions: snapshot.totalTx,
      success_transactions: snapshot.successTx,
      failed_transactions: snapshot.failTx,
      success_rate_pct: failRate.toFixed(1),
      total_events: snapshot.totalEvents,
      events_per_tx: eventsPerTx.toFixed(2),
      avg_gas: Math.round(snapshot.avgGas),
      max_gas: snapshot.maxGas,
      latest_block: snapshot.latestBlock,
      top_senders: snapshot.topSenders.map(s => ({ sender: s.sender, count: parseInt(s.count, 10) })),
      top_event_types: snapshot.topEventTypes.map(e => ({ type: e.type, count: parseInt(e.count, 10) })),
    },
    highlights: analyzed.highlights,
    warnings: analyzed.warnings,
    insights: analyzed.insights,
  };
}
