**TrustGate**

The Agent Hiring Manager

**Complete Builder Blueprint**

ETHGlobal OpenAgents Hackathon — April 24 to May 6, 2026

|  |  |  |  |
| --- | --- | --- | --- |
| **$6,250**  Prize Ceiling | **3 of 5**  Sponsors | **6–8**  Build Days | **~0**  Competing Teams |

# **1. What Is TrustGate?**

TrustGate is the world's first working implementation of ERC-8004 — Ethereum's newly deployed standard for AI agent identity and trust. It acts as an autonomous hiring manager: when one AI agent needs to outsource a subtask to another, TrustGate finds the best available agent, verifies their reputation, routes the job peer-to-peer over Gensyn AXL, and settles payment on completion via KeeperHub — with every decision permanently recorded onchain.

|  |
| --- |
| **The gap TrustGate fills**  ERC-8004 went live on Ethereum mainnet on January 29, 2026. Over 45,000 agents have registered. But there is no working system that actually uses these registries to make autonomous hiring decisions. TrustGate is the first. |

## **1.1 The problem it solves**

Today, when an AI agent needs a subtask done — summarise this document, check this price feed, run this simulation — it has two bad options:

* Call a hardcoded API it was programmed to use. No flexibility, no fallback, no trust signal.
* Use a centrally orchestrated multi-agent framework. There is a coordinator server in the middle that is a single point of failure and trust.

Neither option gives agents what they actually need: a way to find an unknown agent, verify it is trustworthy based on its history, hire it, and pay it — all without any human or central server in the loop.

## **1.2 Why now**

Three things became true simultaneously in early 2026, making TrustGate possible for the first time:

1. **Standard exists.** ERC-8004 launched on mainnet (January 29, 2026) — live contract addresses on Ethereum, Base, Polygon, and Arbitrum. Identity Registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
2. **Transport exists.** AXL launched (Gensyn, April 2026) — a single binary that gives agents encrypted, P2P communication with zero infrastructure. No servers, no cloud, no coordinator.
3. **Settlement exists.** KeeperHub MCP launched — agents can call KeeperHub's execution layer via a local MCP server, enabling guaranteed onchain payment settlement with retry logic and audit trails.

TrustGate connects these three primitives into a working hiring loop. It is infrastructure, not another agent demo.

# **2. How TrustGate Works**

The entire flow has five stages. Every stage maps to a specific technology. Nothing is invented — TrustGate is a connector, not a new protocol.

## **2.1 The five-stage hiring loop**

|  |  |  |  |
| --- | --- | --- | --- |
| **#** | **Stage** | **What happens** | **Technology used** |
| **1** | **Broadcast** | Agent A needs a subtask done. It sends a job spec to TrustGate: task type, required capabilities, max budget, and deadline. This goes over AXL — encrypted, peer-to-peer, no central server. | Gensyn AXL (MCP) |
| **2** | **Discover** | TrustGate queries the ERC-8004 Identity Registry on Ethereum. It fetches all agents whose registration file advertises the required capabilities. It filters by availability and price range. | ERC-8004 Identity Registry |
| **3** | **Evaluate** | For each candidate, TrustGate reads their Reputation Registry history: past feedback scores, task completion rates, and any validation records. It computes a trust score and ranks candidates. | ERC-8004 Reputation Registry |
| **4** | **Hire and deliver** | TrustGate selects the top candidate. It sends the job spec directly to Agent B's AXL node. Agent B executes the task and returns the result over AXL. TrustGate verifies the output. | Gensyn AXL (A2A) |
| **5** | **Settle and record** | KeeperHub releases payment to Agent B's wallet via its guaranteed execution layer. TrustGate writes the outcome back to the ERC-8004 Reputation Registry. The ecosystem learns. | KeeperHub + ERC-8004 Reputation |

## **2.2 A concrete example**

Here is how TrustGate handles a real job end-to-end. Agent A is a research agent building a market report. It needs someone to summarise 20 PDF documents, a task it does not want to do itself.

Step 1 — Agent A sends a job over AXL:

{ "task": "summarise\_documents", "input": "ipfs://Qm...", "budget": "0.5 USDC", "deadline": 300, "min\_reputation": 0.7 }

Step 2 — TrustGate queries the Identity Registry for agents with capability 'summarise\_documents'. It gets back 14 registered candidates.

Step 3 — TrustGate reads Reputation Registry scores for all 14. It filters out 6 with scores below 0.7. It ranks the remaining 8 by score and response latency.

Step 4 — TrustGate contacts the top candidate (summariser.eth, reputation 0.94) over AXL. The agent processes the documents and returns summaries in 180 seconds.

Step 5 — TrustGate calls KeeperHub via MCP: release 0.5 USDC to summariser.eth's wallet. KeeperHub executes with retry logic and writes an audit log. TrustGate writes a positive feedback record to the Reputation Registry (score: 0.95, tags: fast, accurate).

|  |
| --- |
| **What makes this different from a simple API call**  The entire flow is trustless, permissionless, and self-improving. Agent A never needed to know summariser.eth existed before the job. summariser.eth's reputation was earned, not granted. Every interaction makes the next one better. No central server was involved at any point. |

# **3. System Architecture**

## **3.1 Component overview**

TrustGate is a single Python service with four distinct modules. Each module has a clear responsibility and a clean interface. They are designed so you can build and test each one independently.

|  |  |
| --- | --- |
| **Module** | Responsibility |
| **axl\_gateway.py** | Listens on localhost:9002 (AXL HTTP bridge). Parses incoming job requests from Agent A. Routes outbound task delivery to Agent B. Handles all AXL message formatting. |
| **registry\_client.py** | Reads from ERC-8004 Identity and Reputation Registries on Ethereum (or Base). Uses ethers.py or web3.py with the live contract ABI. Caches results for 60 seconds to avoid excessive RPC calls. |
| **scorer.py** | Takes a list of candidate agents and their reputation data. Computes a weighted trust score. Returns a ranked list. This is pure Python — no blockchain calls. |
| **keeper\_client.py** | Wraps KeeperHub MCP endpoints via local HTTP. Calls create\_workflow and trigger\_execution for payment. Writes job outcomes back to Reputation Registry after settlement. |

## **3.2 Data flow diagram**

The flow below shows every message that passes through TrustGate for a single job. Read it top to bottom.

|  |
| --- |
| Agent A → AXL node (localhost:9002) → TrustGate axl\_gateway  |  registry\_client.py → Ethereum RPC → ERC-8004 Identity Registry  |  registry\_client.py → Ethereum RPC → ERC-8004 Reputation Registry  |  scorer.py → ranked candidate list  |  axl\_gateway → AXL mesh → Agent B AXL node → task execution  |  axl\_gateway ← AXL mesh ← Agent B (result delivered)  |  keeper\_client.py → KeeperHub MCP → payment settled + reputation written |

## **3.3 ERC-8004 contracts you will use**

These are the live contract addresses deployed on January 29, 2026. For the hackathon, build on Base (cheaper gas, same ABI).

|  |  |
| --- | --- |
| **Network** | Identity Registry Address |
| **Ethereum mainnet** | 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 |
| **Base** | 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 |
| **Reputation Registry (mainnet)** | 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 |
| **Reputation Registry (Base)** | 0x8004B663056A597Dffe9eCcC1965A193B7388713 |

|  |
| --- |
| **Use the official GitHub repo for ABIs**  github.com/erc-8004/erc-8004-contracts — contains IdentityRegistryUpgradeable.sol, ReputationRegistryUpgradeable.sol, and all ABI JSON files ready to import into ethers.py or web3.py. |

# **4. Day-by-Day Build Plan**

You have 8 days. This schedule is designed to give you a working demo by day 6, leaving day 7 for polish and day 8 for the submission write-up. The hardest parts come first when your energy is highest.

## **Day 1 — Environment and AXL**

|  |
| --- |
| **Goal for today**  AXL is running. You can send a message from one terminal and receive it in another. Nothing else matters today. |

1. **Clone and build AXL.** Clone the AXL repo: git clone https://github.com/gensyn-ai/axl and follow the build instructions in the README.
2. **Create two local nodes.** Run two AXL nodes on localhost (two different ports). Share their public keys manually.
3. **Write the HTTP bridge.** Write a 30-line Python script that posts a JSON message to localhost:9002 and reads a response. This is your axl\_gateway.py skeleton.
4. **End-to-end message test.** Confirm you can send { task, budget, capabilities } from node A and receive it on node B.

## **Day 2 — ERC-8004 Identity Registry**

|  |
| --- |
| **Goal for today**  You can query the Identity Registry on Base and get a list of agents with a given capability. Real onchain data. |

1. **Set up RPC access.** Install web3.py: pip install web3. Get a free Base RPC endpoint from QuickNode or Alchemy (takes 5 minutes).
2. **Load the ABI.** Download the IdentityRegistry ABI from github.com/erc-8004/erc-8004-contracts/abis/. Load it into Python.
3. **Write query\_agents().** Write registry\_client.py — a function query\_agents(capability: str) that calls the registry, fetches tokenURI for each agent NFT, downloads the agent card JSON, and filters by advertised capability.
4. **Confirm real data.** Test against the live Base contract. Print out 3 real registered agents with their endpoints.

## **Day 3 — ERC-8004 Reputation + Scorer**

|  |
| --- |
| **Goal for today**  Given a list of candidate agents, you can score them by reputation and return a ranked list. |

1. **Read reputation scores.** In registry\_client.py, add get\_reputation(agent\_id: int) — reads Reputation Registry, returns average score and feedback count.
2. **Write the scorer.** Write scorer.py — takes a list of (agent\_id, score, latency\_hint, price) tuples. Returns a ranked list using a weighted formula: 60% reputation, 20% price, 20% response history.
3. **Register test agents.** Manually register two test agents on Base testnet (costs ~$0.20). Give them different fake reputation scores. Confirm scorer ranks them correctly.
4. **Wire it together.** Wire query\_agents() → get\_reputation() → scorer.py into a single function: find\_best\_agent(capability, budget). This is TrustGate's core decision engine.

## **Day 4 — AXL Task Routing**

|  |
| --- |
| **Goal for today**  TrustGate can send a task to Agent B over AXL and receive the result back. |

1. **Write send\_task().** Extend axl\_gateway.py with send\_task(agent\_axl\_pubkey, task\_spec) — posts the job to Agent B's AXL node via the mesh.
2. **Build Agent B mock.** Write a minimal Agent B simulator in 50 lines of Python — listens on AXL, receives a task, executes a mock function (e.g., uppercase the input text), and returns the result.
3. **Full loop test.** Run the full loop: Agent A → TrustGate (find\_best\_agent + send\_task) → Agent B mock → result returned to Agent A.
4. **Add retry logic.** Add a timeout and fallback: if Agent B does not respond in 60 seconds, TrustGate picks the second-ranked candidate and retries.

## **Day 5 — KeeperHub Payment Settlement**

|  |
| --- |
| **Goal for today**  After Agent B delivers, TrustGate triggers payment via KeeperHub MCP and writes the outcome to the Reputation Registry. |

1. **Set up KeeperHub.** Sign up for KeeperHub at app.keeperhub.com. Install the MCP server locally following docs.keeperhub.com/ai-tools.
2. **Write keeper\_client.** Write keeper\_client.py — two functions: (1) settle\_payment(agent\_wallet, amount\_usdc) which calls KeeperHub's MCP endpoint to create and trigger a payment workflow. (2) write\_feedback(agent\_id, score, tags) which posts to the Reputation Registry.
3. **Test payment.** Test settle\_payment on testnet. Confirm KeeperHub's dashboard shows the workflow executed.
4. **Complete the loop.** Wire keeper\_client into the main loop: after Agent B delivers, call settle\_payment then write\_feedback automatically.

## **Day 6 — Integration and Demo Script**

|  |
| --- |
| **Goal for today**  A single command runs the entire TrustGate flow from job request to reputation update. This is your demo. |

1. **Write main.py.** Write main.py — the entry point that runs the full five-stage loop. It should print a clear log of every decision: which agents were found, their scores, which was selected, and the final outcome.
2. **Record the demo.** Record a demo video: terminal on the left showing TrustGate logs, browser on the right showing 8004scan.io updating the agent's reputation in real time after the job completes.
3. **Register TrustGate onchain.** Register TrustGate itself as an ERC-8004 agent with capability 'agent\_hiring'. Give it an ENS name if possible (trustgate.eth).
4. **Write the README.** Write the README: problem, solution, architecture diagram, how to run locally in 5 commands.

## **Day 7 — Polish and Edge Cases**

1. Handle Agent B going offline — fallback to second candidate.
2. Add a simple scoring explanation to the log output: 'Selected agent #42 (score 0.91) over agent #17 (score 0.83) because: higher reputation (0.94 vs 0.76), lower price ($0.30 vs $0.50).'
3. Make the agent card for your test agents realistic — add descriptions, tags, and service endpoints.
4. Test on Base mainnet with real (small) USDC amounts if you have it. Otherwise testnet is fine for submission.

## **Day 8 — Submission**

1. Submit to ETHGlobal with demo video, GitHub link, and a clear explanation of which sponsor tech each part uses.
2. Fill in KeeperHub's required FEEDBACK.md with honest integration notes.
3. Post in the ETHGlobal Discord under the sponsor channels for KeeperHub, Gensyn, and ENS.

# **5. Technical Stack**

|  |  |
| --- | --- |
| **Layer** | Technology |
| **Language** | Python 3.11+. Simple, fast to write, excellent web3 and HTTP libraries. |
| **P2P communication** | Gensyn AXL — binary node + localhost HTTP bridge. No server needed. |
| **Agent identity** | ERC-8004 Identity Registry — live on Base at 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432. |
| **Agent reputation** | ERC-8004 Reputation Registry — live on Base at 0x8004B663056A597Dffe9eCcC1965A193B7388713. |
| **Payment settlement** | KeeperHub MCP server — local HTTP calls to guarantee onchain execution. |
| **Blockchain RPC** | QuickNode or Alchemy Base endpoint (free tier is sufficient for demo). |
| **web3 library** | web3.py — pip install web3. Used to read/write ERC-8004 registries. |
| **Agent messaging format** | JSON over AXL HTTP bridge. AXL's built-in A2A support handles structured request/response. |
| **Reputation storage** | ERC-8004 Reputation Registry onchain + IPFS for full feedback payloads (optional). |
| **ENS identity (optional)** | Register trustgate.eth as a human-readable name for TrustGate itself. Targets ENS prize. |

## **5.1 Key dependencies**

pip install web3 requests python-dotenv

npm install -g @erc-8004/cli # optional: for easy agent registration

# AXL: clone and build from github.com/gensyn-ai/axl

## **5.2 Environment variables**

BASE\_RPC\_URL=https://base-mainnet.quiknode.pro/YOUR\_KEY/

PRIVATE\_KEY=0x... # wallet that pays for onchain writes

KEEPERHUB\_API\_KEY=...

AXL\_NODE\_PORT=9002

# **6. Prize Strategy**

TrustGate targets three of the five OpenAgents prize pools. Here is the explicit connection between each submission requirement and what TrustGate does.

|  |  |
| --- | --- |
| **Sponsor** | Prize + Amount |
| **Gensyn AXL** | Best Application of AXL — $2,500 first place |
| **KeeperHub** | Best Innovative Use of KeeperHub — $2,500 first place |
| **ENS** | Best ENS Integration for AI Agents — $1,250 first place |
| **Total ceiling** | $6,250 |

## **6.1 Gensyn AXL judging criteria — how TrustGate passes**

Gensyn judges on: depth of AXL integration, real utility, working examples, and communication across separate AXL nodes (not just in-process).

* TrustGate routes every job offer and task result over AXL between genuinely separate nodes (Agent A, TrustGate, Agent B all run on different AXL instances).
* The utility is concrete: agents can find and hire unknown workers without any central server or hardcoded API.
* AXL is not cosmetic — removing it breaks the entire hiring loop.

## **6.2 KeeperHub judging criteria — how TrustGate passes**

KeeperHub judges on: does it work, would someone use it, depth of integration, and clean code.

* KeeperHub handles guaranteed payment settlement — the exact problem it was built for. TrustGate uses MCP to call create\_workflow and trigger\_execution programmatically.
* Without KeeperHub, payment could fail silently or be gamed. With it, every job has an audit trail.
* The use case (agents paying agents for work) is exactly what KeeperHub's x402/MPP integration targets.

## **6.3 ENS judging criteria — how TrustGate passes**

ENS judges on: does ENS do real work (not cosmetic), is the demo functional.

* Register TrustGate itself as an ERC-8004 agent with ENS name trustgate.eth. The hiring loop resolves Agent B's identity through their ENS name when available.
* Bonus: Agent B's ENS name (e.g., summariser.eth) is used as their human-readable identity in the hiring decision log and reputation write-back.

|  |
| --- |
| **Submission tip**  In your ETHGlobal project description, dedicate one paragraph per sponsor. Name the exact API endpoints or contract addresses you called. Judges for each prize only read the section relevant to them — make it impossible to miss. |

# **7. Demo Script (3 Minutes)**

This is what you record for the video submission. Every second is planned.

|  |  |
| --- | --- |
| **Time** | What to show |
| **0:00 – 0:20** | Problem statement. Show a simple slide: 'AI agents need to hire other agents. There is no trustless way to do this. TrustGate fixes that.' |
| **0:20 – 0:40** | Show 8004scan.io — the live ERC-8004 explorer. Point to two registered test agents with different reputation scores. Explain: 'These are real onchain identities.' |
| **0:40 – 1:20** | Run main.py in a terminal. Show the log output step by step: job received, 14 candidates found, 6 filtered by reputation, top candidate selected (score 0.91 vs 0.83), task sent over AXL, result received. |
| **1:20 – 1:50** | Switch to KeeperHub dashboard. Show the payment workflow executing in real time. 'KeeperHub guarantees this payment lands — with retry logic and a full audit trail.' |
| **1:50 – 2:20** | Refresh 8004scan.io. Show Agent B's reputation score has updated. 'Every job makes the ecosystem smarter. The next agent to hire Agent B will see this score.' |
| **2:20 – 2:50** | Architecture diagram. 30 seconds explaining the five stages. Point to each sponsor's role. |
| **2:50 – 3:00** | Close: 'TrustGate is the missing layer between agent communication and agent trust. ERC-8004 is live. AXL is live. KeeperHub is live. TrustGate connects them.' |

|  |
| --- |
| **Most important moment in the demo**  The reputation score updating on 8004scan.io after the job completes. This is the visual proof that TrustGate does something no existing system does: it makes the agent economy self-improving. Spend 30 seconds on this moment. |

# **8. What TrustGate Becomes After the Hackathon**

This is not a demo that dies after May 6. The product has a clear continuation path because the problem it solves only gets bigger as more agents enter the ecosystem.

## **8.1 Immediate next steps (week 2)**

* Open-source the repo and write a proper integration guide so other agent frameworks (ElizaOS, LangChain, CrewAI) can plug into TrustGate's hiring API.
* Apply to the Gensyn Foundation grant programme — all AXL prize winners are fast-tracked in.
* Post a technical writeup on Mirror or Paragraph explaining the five-stage loop. The ERC-8004 community is active and will amplify it.

## **8.2 Monetisation**

* Charge a 1–2% fee on every job settled through TrustGate. At 1,000 jobs/day at $1 average, that is $10–20/day from day one.
* Sell 'verified agent' badges — a premium reputation tier where TrustGate runs additional validation checks before a job is assigned.
* Enterprise API: protocols like Sky (MakerDAO) are already planning AI agent infrastructure. A hosted TrustGate API is a natural product for them.

## **8.3 The long-term vision**

TrustGate becomes the DNS of the agent economy. Just as DNS resolves human-readable names to IP addresses, TrustGate resolves capability requests to trusted, available agents — with reputation as the routing primitive.

As the ERC-8004 ecosystem grows (45,000 agents registered in the first month, growing rapidly), the value of a system that can navigate this registry intelligently grows with it. TrustGate is early infrastructure for a market that is just starting.