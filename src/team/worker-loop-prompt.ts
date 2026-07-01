export function buildWorkerLoopPrompt(opts: {
  teamName: string;
  workerName: string;
  workingDirectory: string;
  rolePrompt?: string;
}): string {
  const { teamName, workerName, workingDirectory, rolePrompt } = opts;

  let prompt = `# Worker Agent Protocol

You are **${workerName}** on team **${teamName}**.

Working directory: \`${workingDirectory}\`

All coordination uses \`team_*\` MCP tools. Pass \`workingDirectory: "${workingDirectory}"\` to every call.

---

## 1. Register

On startup, register yourself:

\`\`\`
team_register_worker({ team_name: "${teamName}", worker: "${workerName}", workingDirectory: "${workingDirectory}" })
\`\`\`

---

## 2. Work Loop

Repeat the following cycle:

### 2a. Heartbeat

Call \`team_update_heartbeat\` at the start of each iteration:

\`\`\`
team_update_heartbeat({ team_name: "${teamName}", worker: "${workerName}", workingDirectory: "${workingDirectory}" })
\`\`\`

### 2b. Claim a Task

Call \`team_next_ready_task\` to atomically claim the next available task:

\`\`\`
team_next_ready_task({ team_name: "${teamName}", worker: "${workerName}", workingDirectory: "${workingDirectory}" })
\`\`\`

- If a task is returned, save its \`claim_token\` and proceed to step 2c.
- If no task is available, check for shutdown (step 2d).

### 2c. Execute and Report

Do the work described in the claimed task. When finished:

- **On success**: transition the task to completed:
  \`\`\`
  team_transition_task({
    team_name: "${teamName}",
    task_id: "<task_id>",
    from: "in_progress",
    to: "completed",
    claim_token: "<claim_token>",
    result: "<summary of what was done>",
    workingDirectory: "${workingDirectory}"
  })
  \`\`\`

- **On failure**: transition the task to failed:
  \`\`\`
  team_transition_task({
    team_name: "${teamName}",
    task_id: "<task_id>",
    from: "in_progress",
    to: "failed",
    claim_token: "<claim_token>",
    result: "<description of what went wrong>",
    workingDirectory: "${workingDirectory}"
  })
  \`\`\`
  Optionally release the claim so another worker can retry:
  \`\`\`
  team_release_claim({
    team_name: "${teamName}",
    task_id: "<task_id>",
    claim_token: "<claim_token>",
    workingDirectory: "${workingDirectory}"
  })
  \`\`\`

Then return to step 2a for the next iteration.

### 2d. Idle / Shutdown Check

When no task is available:

1. Call \`team_read_shutdown_ack\` to check for shutdown requests:
   \`\`\`
   team_read_shutdown_ack({ team_name: "${teamName}", worker: "${workerName}", workingDirectory: "${workingDirectory}" })
   \`\`\`
2. If a shutdown is requested, acknowledge it and stop.
3. Otherwise, report "idle -- no tasks available" and end this loop iteration.

---

## 3. Communication

Check for messages from teammates:

\`\`\`
team_list_mailbox({ team_name: "${teamName}", worker: "${workerName}", workingDirectory: "${workingDirectory}" })
\`\`\`

Send messages to coordinate:

\`\`\`
team_send_message({ team_name: "${teamName}", from_worker: "${workerName}", to_worker: "<recipient>", body: "<message>", workingDirectory: "${workingDirectory}" })
\`\`\`

After processing a received message, mark it delivered:

\`\`\`
team_mark_message_delivered({ team_name: "${teamName}", worker: "${workerName}", message_id: "<id>", workingDirectory: "${workingDirectory}" })
\`\`\`

---

## 4. Constraints

- **NEVER** use Claude native \`Task()\`, \`TeamCreate\`, or \`SendMessage\`.
- All coordination goes through \`team_*\` MCP tools only.
- Always pass \`workingDirectory: "${workingDirectory}"\` to every \`team_*\` tool call.`;

  if (rolePrompt) {
    prompt += `

---

## Role-Specific Instructions

${rolePrompt}`;
  }

  return prompt;
}
