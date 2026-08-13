import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { handleChatCompletion } from "@/lib/chat-handler";
import { createConversation, getConversationDetail } from "@/lib/conversations";
import {
  addKnowledgeDocument,
  addUserKnowledgeDocument,
  searchPersonaKnowledge,
} from "@/lib/knowledge-library";
import { savePersonaMemory } from "@/lib/memory-library";
import { seal, type AiSession } from "@/lib/session";

const sessionSecret = "01234567890123456789012345678901";

const config = {
  publicUrl: new URL("https://ai.example.test"),
  sessionSecret,
  yanCoreApiBaseUrl: new URL("https://api.example.test"),
};

function authenticatedRequest(
  path: string,
  body?: unknown,
  origin = "https://ai.example.test",
  models: string[] = ["deepseek-chat"],
) {
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  const session: AiSession = {
    identity: { sub: "member-1", name: "Member", role: "alumni" },
    subject: { userId: 7, application: "ai-web", audience: "yanchuaner-ai", scopes: "chat:read chat:write" },
    grant: "grant",
    grantExpiresAt: expiresAt,
    credential: {
      accessKey: `sk-yc_${"a".repeat(64)}`,
      models,
      quotaUnits: 50000,
      expiresAt,
    },
  };
  const headers = new Headers({ Cookie: `yc_ai_session=${seal(session, sessionSecret)}`, Origin: origin });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new NextRequest(`https://ai.example.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-chat-route-"));
  const previous = process.env.AI_WEB_DATA_DIR;
  process.env.AI_WEB_DATA_DIR = dir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.AI_WEB_DATA_DIR;
    else process.env.AI_WEB_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test("chat route authenticates the encrypted session without exposing its key", async () => {
  let authorization = "";
  const fetcher: typeof fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  };
  const response = await handleChatCompletion(authenticatedRequest("/api/chat/completions", {
    model: "deepseek-chat",
    messages: [{ role: "user", content: "hello" }],
  }), config, fetcher);
  assert.equal(response.status, 200);
  assert.equal(authorization, `Bearer sk-yc_${"a".repeat(64)}`);
  assert.doesNotMatch(await response.text(), /sk-yc_/);
});

test("chat route rejects a cross-origin request before forwarding", async () => {
  const response = await handleChatCompletion(authenticatedRequest("/api/chat/completions", {
    model: "deepseek-chat",
    messages: [{ role: "user", content: "hello" }],
  }, "https://evil.example.test"), config);
  assert.equal(response.status, 403);
});

test("chat route clears the session when the API reports a revoked credential", async () => {
  const fetcher: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: "token revoked" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };
  const response = await handleChatCompletion(authenticatedRequest("/api/chat/completions", {
    model: "deepseek-chat",
    messages: [{ role: "user", content: "hello" }],
  }), config, fetcher);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.code, "SESSION_REVOKED");
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /yc_ai_session=;/);
  assert.match(setCookie, /Max-Age=0/);
});

test("chat route keeps a model-service failure as a gateway error", async () => {
  const fetcher: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: "upstream down" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  };
  const response = await handleChatCompletion(authenticatedRequest("/api/chat/completions", {
    model: "deepseek-chat",
    messages: [{ role: "user", content: "hello" }],
  }), config, fetcher);
  assert.equal(response.status, 502);
});

test("chat route retrieves persona knowledge and injects it as context", async () => {
  await withDataDir(async () => {
    const persona = {
      id: "preset-star-traveler",
      name: "星河旅者",
      description: "星海旅者",
      firstMessage: "欢迎",
    };
    const conversation = await createConversation(7, { mode: "roleplay", persona });
    await addKnowledgeDocument(
      7,
      persona.id,
      persona.name,
      { name: "往事", text: "校园时代她最怀念的是看星星的往事。" },
      "BAAI/bge-m3",
      () => Promise.resolve([[0, 1, 1]]),
    );
    await addUserKnowledgeDocument(
      7,
      { name: "我的经历", text: "我喜欢在校园里散步。" },
      "BAAI/bge-m3",
      () => Promise.resolve([[0, 1, 0]]),
    );
    await savePersonaMemory(7, {
      personaId: persona.id,
      summary: "角色记住了用户的生日。",
      sourceConversationId: conversation.id,
      messageCount: 30,
    });
    const directHits = await searchPersonaKnowledge(7, persona.id, [0, 1, 1], 4, 0.3);
    assert.equal(directHits.length, 1);

    let seenBody = "";
    let embeddingCalls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      const url = String(_input);
      if (url.endsWith("/v1/embeddings")) {
        embeddingCalls += 1;
        return Response.json({
          object: "list",
          model: "BAAI/bge-m3",
          data: [{ object: "embedding", index: 0, embedding: [0, 1, 1] }],
          usage: { prompt_tokens: 5, total_tokens: 5 },
        });
      }
      seenBody = String(init?.body);
      return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    };

    const response = await handleChatCompletion(
      authenticatedRequest(
        "/api/chat/completions",
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "校园往事" }],
          knowledge: true,
          conversationId: conversation.id,
        },
        "https://ai.example.test",
        ["deepseek-chat", "BAAI/bge-m3"],
      ),
      config,
      fetcher,
    );
    assert.equal(response.status, 200);
    assert.equal(embeddingCalls, 1);
    assert.equal(response.headers.get("x-yan-knowledge-hits"), "2");
    const forwarded = JSON.parse(seenBody);
    assert.match(forwarded.messages[0].content, /长期记忆/);
    assert.match(forwarded.messages[0].content, /生日/);
    assert.match(forwarded.messages[1].content, /资料库/);
    assert.match(forwarded.messages[1].content, /我的经历/);
    assert.match(forwarded.messages[1].content, /校园时代/);
    assert.equal(forwarded.messages[2].role, "user");
    assert.doesNotMatch(seenBody, /sk-yc_/);
  });
});

test("chat route schedules group speakers then streams each member independently", async () => {
  await withDataDir(async () => {
    const first = {
      id: "preset-star-traveler",
      name: "星河旅者",
      description: "星海旅者",
      firstMessage: "欢迎",
    };
    const second = {
      id: "preset-study-buddy",
      name: "燕中学伴",
      description: "校园伙伴",
      firstMessage: "嗨",
    };
    const director = {
      id: "preset-elder",
      name: "长者",
      description: "导演旁白",
      firstMessage: "开始",
    };
    const conversation = await createConversation(7, {
      mode: "group",
      cast: [first, second],
      director,
      world: {
        worldId: "world-campus",
        snapshot: {
          title: "燕川中学",
          description: "临海的寄宿制中学。",
          timeline: "高三上学期",
          outline: "一场关于星空与校园的日常。",
        },
      },
      userRole: {
        name: "转学生",
        description: "刚转来航天班的新同学。",
      },
    });
    await addKnowledgeDocument(
      7,
      first.id,
      first.name,
      { name: "星海资料", text: "她曾在星河中航行。" },
      "BAAI/bge-m3",
      () => Promise.resolve([[1, 0, 0]]),
    );
    await addKnowledgeDocument(
      7,
      second.id,
      second.name,
      { name: "校园资料", text: "他喜欢在操场看星星。" },
      "BAAI/bge-m3",
      () => Promise.resolve([[0, 1, 0]]),
    );
    await savePersonaMemory(7, {
      personaId: first.id,
      summary: "旅者记得曾在星海流浪。",
      sourceConversationId: conversation.id,
      messageCount: 2,
    });
    const detailCheck = await getConversationDetail(7, conversation.id);
    assert.equal(detailCheck.mode, "group");
    assert.equal(detailCheck.cast?.length, 2);

    const forwardedBodies: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      const url = String(_input);
      if (url.endsWith("/v1/embeddings")) {
        return Response.json({
          object: "list",
          model: "BAAI/bge-m3",
          data: [{ object: "embedding", index: 0, embedding: [1, 1, 0] }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        });
      }
      const body = String(init?.body);
      forwardedBodies.push(body);
      const parsed = JSON.parse(body) as { stream?: boolean; speakerId?: string };
      if (parsed.stream === false) {
        return Response.json({
          choices: [
            {
              message: {
                content: '{"speakers":["星河旅者","燕中学伴"]}',
              },
            },
          ],
        });
      }
      return new Response(
        'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };

    const scheduleResponse = await handleChatCompletion(
      authenticatedRequest(
        "/api/chat/completions",
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "聊聊星空和校园" }],
          knowledge: true,
          conversationId: conversation.id,
          groupSchedule: true,
        },
        "https://ai.example.test",
        ["deepseek-chat", "BAAI/bge-m3"],
      ),
      config,
      fetcher,
    );
    if (scheduleResponse.status !== 200) {
      throw new Error(`expected 200, got ${scheduleResponse.status}: ${await scheduleResponse.text()}`);
    }
    const schedule = await scheduleResponse.json();
    assert.deepEqual(schedule.speakers, [
      { id: first.id, name: first.name },
      { id: second.id, name: second.name },
    ]);

    const scheduleBody = JSON.parse(forwardedBodies[0]) as {
      stream: boolean;
      messages: { role: string; content: string }[];
    };
    assert.equal(scheduleBody.stream, false);
    assert.match(scheduleBody.messages[0].content, /调度器/);
    assert.match(scheduleBody.messages[0].content, /星河旅者/);
    assert.match(scheduleBody.messages[0].content, /燕中学伴/);
    assert.match(scheduleBody.messages[0].content, /主持人绝不发言/);
    assert.match(scheduleBody.messages[0].content, /燕川中学/);
    assert.match(scheduleBody.messages[0].content, /转学生/);

    const speakerResponses: Response[] = [];
    for (const speaker of [first, second]) {
      const response = await handleChatCompletion(
        authenticatedRequest(
          "/api/chat/completions",
          {
            model: "deepseek-chat",
            messages: [{ role: "user", content: "聊聊星空和校园" }],
            knowledge: true,
            conversationId: conversation.id,
            speakerId: speaker.id,
          },
          "https://ai.example.test",
          ["deepseek-chat", "BAAI/bge-m3"],
        ),
        config,
        fetcher,
      );
      assert.equal(response.status, 200);
      speakerResponses.push(response);
    }
    assert.equal((await speakerResponses[0].text()).includes("你好"), true);

    const speakerBodies = forwardedBodies
      .slice(1)
      .map((raw) => JSON.parse(raw) as { messages: { role: string; content: string }[] });
    assert.equal(speakerBodies.length, 2);
    const firstBody = speakerBodies.find((item) => item.messages[0].content.startsWith("你是「星河旅者」"));
    const secondBody = speakerBodies.find((item) => item.messages[0].content.startsWith("你是「燕中学伴」"));
    assert.ok(firstBody && secondBody);
    assert.match(firstBody.messages[0].content, /你是「星河旅者」/);
    assert.match(firstBody.messages[0].content, /在场的其他成员/);
    assert.match(firstBody.messages[0].content, /燕中学伴/);
    assert.match(firstBody.messages[0].content, /旅者记得曾在星海流浪/);
    assert.match(firstBody.messages[0].content, /星海资料/);
    assert.doesNotMatch(firstBody.messages[0].content, /导演记得/);
    assert.match(firstBody.messages[0].content, /燕川中学/);
    assert.match(firstBody.messages[0].content, /转学生/);
    assert.match(firstBody.messages.at(-1)?.content ?? "", /转学生：聊聊星空和校园/);
    assert.match(secondBody.messages[0].content, /你是「燕中学伴」/);
    assert.match(secondBody.messages[0].content, /校园资料/);
    assert.doesNotMatch(secondBody.messages[0].content, /旅者记得/);
    assert.equal(firstBody.messages.at(-1)?.role, "user");
  });
});

test("group speaker names fall back to a member when the scheduler output is invalid", async () => {
  await withDataDir(async () => {
    const first = {
      id: "preset-star-traveler",
      name: "星河旅者",
      description: "星海旅者",
      firstMessage: "欢迎",
    };
    const second = {
      id: "preset-study-buddy",
      name: "燕中学伴",
      description: "校园伙伴",
      firstMessage: "嗨",
    };
    const conversation = await createConversation(7, { mode: "group", cast: [first, second] });
    const fetcher: typeof fetch = async (_input, init) => {
      const url = String(_input);
      if (url.endsWith("/v1/embeddings")) {
        return Response.json({
          object: "list",
          model: "BAAI/bge-m3",
          data: [{ object: "embedding", index: 0, embedding: [1, 1, 0] }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        });
      }
      const body = String(init?.body);
      const parsed = JSON.parse(body) as { stream?: boolean };
      if (parsed.stream === false) {
        return Response.json({ choices: [{ message: { content: "我选不出人。" } }] });
      }
      return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    };
    const response = await handleChatCompletion(
      authenticatedRequest(
        "/api/chat/completions",
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "随便聊聊" }],
          knowledge: true,
          conversationId: conversation.id,
          groupSchedule: true,
        },
        "https://ai.example.test",
        ["deepseek-chat", "BAAI/bge-m3"],
      ),
      config,
      fetcher,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { speakers: { id: string }[] };
    assert.ok(body.speakers.length >= 1 && body.speakers.length <= 2);
    assert.ok(body.speakers.every((speaker) => [first.id, second.id].includes(speaker.id)));
  });
});

test("group scheduler never picks the director even when it is also in the cast", async () => {
  await withDataDir(async () => {
    const traveler = {
      id: "preset-star-traveler",
      name: "星河旅者",
      description: "星海旅者",
      firstMessage: "欢迎",
    };
    const elder = {
      id: "preset-elder",
      name: "长者",
      description: "温和的长者",
      firstMessage: "开始",
    };
    const conversation = await createConversation(7, {
      mode: "group",
      cast: [traveler, elder],
      director: elder,
    });
    const fetcher: typeof fetch = async (_input, init) => {
      const url = String(_input);
      if (url.endsWith("/v1/embeddings")) {
        return Response.json({
          object: "list",
          model: "BAAI/bge-m3",
          data: [{ object: "embedding", index: 0, embedding: [1, 0, 0] }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        });
      }
      const parsed = JSON.parse(String(init?.body)) as { stream?: boolean };
      if (parsed.stream === false) {
        return Response.json({
          choices: [{ message: { content: '{"speakers":["长者","星河旅者"]}' } }],
        });
      }
      return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    };
    const response = await handleChatCompletion(
      authenticatedRequest(
        "/api/chat/completions",
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "旅者你多大了？" }],
          knowledge: true,
          conversationId: conversation.id,
          groupSchedule: true,
        },
        "https://ai.example.test",
        ["deepseek-chat", "BAAI/bge-m3"],
      ),
      config,
      fetcher,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { speakers: { id: string; name: string }[] };
    assert.deepEqual(body.speakers, [{ id: traveler.id, name: traveler.name }]);
  });
});

test("group opening schedules a greeting without a user message", async () => {
  await withDataDir(async () => {
    const first = {
      id: "preset-min-teacher",
      name: "闵先生",
      description: "班主任",
      firstMessage: "进来坐。",
    };
    const second = {
      id: "preset-madan",
      name: "马蛋",
      description: "年级第一",
      firstMessage: "说吧。",
    };
    const conversation = await createConversation(7, { mode: "group", cast: [first, second] });
    const forwarded: { stream?: boolean; messages: { role: string; content: string }[] }[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      const url = String(_input);
      if (url.endsWith("/v1/embeddings")) {
        return Response.json({
          object: "list",
          model: "BAAI/bge-m3",
          data: [{ object: "embedding", index: 0, embedding: [1, 0, 0] }],
          usage: { prompt_tokens: 1, total_tokens: 1 },
        });
      }
      const parsed = JSON.parse(String(init?.body)) as {
        stream?: boolean;
        messages: { role: string; content: string }[];
      };
      forwarded.push(parsed);
      if (parsed.stream === false) {
        return Response.json({
          choices: [{ message: { content: '{"speakers":["闵先生"]}' } }],
        });
      }
      return new Response(
        'data: {"choices":[{"delta":{"content":"欢迎，新同学。"}}]}\n\ndata: [DONE]\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };

    const schedule = await handleChatCompletion(
      authenticatedRequest(
        "/api/chat/completions",
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "开始群聊" }],
          knowledge: false,
          conversationId: conversation.id,
          groupSchedule: true,
          opening: true,
        },
        "https://ai.example.test",
        ["deepseek-chat", "BAAI/bge-m3"],
      ),
      config,
      fetcher,
    );
    assert.equal(schedule.status, 200);
    const scheduleBody = (await schedule.json()) as { speakers: { id: string; name: string }[] };
    assert.deepEqual(scheduleBody.speakers, [{ id: first.id, name: first.name }]);
    assert.match(forwarded[0].messages.at(-1)?.content ?? "", /群聊刚开始/);

    const speaker = await handleChatCompletion(
      authenticatedRequest(
        "/api/chat/completions",
        {
          model: "deepseek-chat",
          messages: [{ role: "user", content: "开始群聊" }],
          knowledge: false,
          conversationId: conversation.id,
          speakerId: first.id,
          opening: true,
        },
        "https://ai.example.test",
        ["deepseek-chat", "BAAI/bge-m3"],
      ),
      config,
      fetcher,
    );
    assert.equal(speaker.status, 200);
    assert.equal((await speaker.text()).includes("欢迎，新同学。"), true);
    const speakerRequest = forwarded[1];
    assert.match(speakerRequest.messages[0].content, /这是群聊的开场/);
    assert.equal(speakerRequest.messages.length, 1, "开场请求不应携带假用户消息");
  });
});
