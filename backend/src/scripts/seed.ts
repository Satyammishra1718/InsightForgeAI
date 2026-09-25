import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User, ResearchSession, AgentTrace, Report } from '../models/index.js';

export async function seedDatabase(customUri?: string) {
  console.log('[Seed] Connecting to MongoDB...');
  await connectDatabase(customUri);

  console.log('[Seed] Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    ResearchSession.deleteMany({}),
    AgentTrace.deleteMany({}),
    Report.deleteMany({}),
  ]);

  console.log('[Seed] Creating demo user...');
  const user = await User.create({
    name: 'Dr. Evelyn Vance',
    email: 'evelyn.vance@insightforge.ai',
  });

  console.log('[Seed] Creating research sessions...');

  // 1. Completed Session with Report and Traces
  const session1 = await ResearchSession.create({
    userId: user._id,
    query: 'Quantum error correction thresholds and lattice surgery in surface codes',
    status: 'completed',
  });

  await AgentTrace.create([
    {
      sessionId: session1._id,
      agentName: 'OrchestratorAgent',
      step: 1,
      input: { query: session1.query },
      output: {
        strategy: 'literature_decomposition',
        subtasks: [
          'search_fault_tolerance_thresholds',
          'extract_lattice_surgery_data',
          'synthesize',
        ],
      },
    },
    {
      sessionId: session1._id,
      agentName: 'WebSearchAgent',
      step: 2,
      input: { keywords: ['surface code fault tolerance threshold', 'lattice surgery routing'] },
      output: {
        sourcesDiscovered: 12,
        highRelevanceSources: 3,
      },
    },
    {
      sessionId: session1._id,
      agentName: 'SynthesisAgent',
      step: 3,
      input: { gatheredSourcesCount: 3 },
      output: {
        reportGenerated: true,
        wordCount: 380,
      },
    },
  ]);

  await Report.create({
    sessionId: session1._id,
    content: `# Surface Code Quantum Error Correction: State of the Art

## Executive Summary
Surface codes remain the foremost architecture for fault-tolerant quantum computing due to their 2D nearest-neighbor coupling compatibility and high error thresholds (~1% under depolarizing noise).

## Core Findings
- **Physical Overhead**: Fault-tolerant quantum computing currently requires an estimated 1,000 to 1,500 physical qubits per logical qubit for deep circuit execution.
- **Lattice Surgery**: Planar lattice surgery enables transversal multi-qubit Pauli measurements without physical braid routing, reducing hardware connectivity bottlenecks by ~35%.
- **Hardware Trajectories**: Superconducting transmon arrays and neutral atom optical tweezers are currently demonstrating early logical memory lifetimes that surpass physical qubit baselines.`,
    sources: [
      {
        title: 'Physical Review A - Fault-Tolerant Surface Codes',
        url: 'https://journals.aps.org/pra/quantum-surface-codes',
        snippet: 'Comprehensive analysis of threshold limits and syndrome extraction cycles.',
      },
      {
        title: 'Nature Physics - Real-Time Lattice Surgery Execution',
        url: 'https://nature.com/articles/s41567-quantum-surgery',
        snippet:
          'Experimental realization of fault-tolerant logical operations using ancilla patches.',
      },
    ],
  });

  // 2. In-Progress Session with Active Traces
  const session2 = await ResearchSession.create({
    userId: user._id,
    query: 'Autonomous multi-agent negotiation protocols for decentralized microgrids',
    status: 'in_progress',
  });

  await AgentTrace.create([
    {
      sessionId: session2._id,
      agentName: 'OrchestratorAgent',
      step: 1,
      input: { query: session2.query },
      output: {
        plan: ['market_mechanism_search', 'game_theoretic_evaluations'],
      },
    },
    {
      sessionId: session2._id,
      agentName: 'WebSearchAgent',
      step: 2,
      input: { keywords: ['peer-to-peer energy auction protocols', 'multi-agent consensus'] },
      output: {
        status: 'scraping_ieee_papers',
        activeRequests: 4,
      },
    },
  ]);

  // 3. Completed Session with Genomics comparison
  const session3 = await ResearchSession.create({
    userId: user._id,
    query: 'State-space models (Mamba) vs Transformers in long-context genomics',
    status: 'completed',
  });

  await AgentTrace.create([
    {
      sessionId: session3._id,
      agentName: 'OrchestratorAgent',
      step: 1,
      input: { query: session3.query },
      output: { plan: ['benchmark_retrieval', 'complexity_analysis'] },
    },
    {
      sessionId: session3._id,
      agentName: 'DocRetrievalAgent',
      step: 2,
      input: { targetCorpus: 'genomics_ai_2025_2026' },
      output: { documentsRetrieved: 5 },
    },
    {
      sessionId: session3._id,
      agentName: 'SynthesisAgent',
      step: 3,
      input: { documents: 5 },
      output: { completed: true },
    },
  ]);

  await Report.create({
    sessionId: session3._id,
    content: `# State-Space Models vs Transformers in Genomic Sequence Modeling

## Overview
Recent evaluation on million-base-pair DNA sequence tasks demonstrates that selective state-space architectures (Mamba) achieve comparable upstream masked nucleotide modeling performance to Transformer baselines while reducing inference memory scaling from $O(N^2)$ to $O(N)$.`,
    sources: [
      {
        title: 'Bioinformatics Research Journal: Long-Context DNA Foundations',
        url: 'https://biorxiv.org/content/genomic-ssm-study',
        snippet: 'Comparing linear recurrences and self-attention on splice-site detection.',
      },
    ],
  });

  // 4. Pending Session
  const session4 = await ResearchSession.create({
    userId: user._id,
    query:
      'Comparative analysis of frontier AI safety regulations: EU AI Act vs US Executive Orders',
    status: 'pending',
  });

  console.log(`[Seed] Seeded successfully!`);
  console.log(`  - 1 User (${user.name})`);
  console.log(`  - 4 Sessions created:`);
  console.log(`    * [completed]   ${session1._id} ("${session1.query.slice(0, 45)}...")`);
  console.log(`    * [in_progress] ${session2._id} ("${session2.query.slice(0, 45)}...")`);
  console.log(`    * [completed]   ${session3._id} ("${session3.query.slice(0, 45)}...")`);
  console.log(`    * [pending]     ${session4._id} ("${session4.query.slice(0, 45)}...")`);

  return {
    userId: user._id,
    sessions: [session1, session2, session3, session4],
  };
}

// Direct execution guard
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(async () => {
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('[Seed] Failed:', error);
      await disconnectDatabase();
      process.exit(1);
    });
}
