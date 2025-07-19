// import { get } from "http";
import { Context, Schema, h } from "koishi";
import puppeteer from "puppeteer";
export const name = "niuke-data";
import {} from "koishi-plugin-cron";
export const inject = {
  required: ["puppeteer", "cron", "database"],
  optional: [],
};

export const usage = `
## 定期推送
插件将会在每周五和周日的18:45爬取牛客比赛信息；\n\n若当天有 周赛 / 月赛 / 练习赛 / 挑战赛，将会根据下方对应配置推送到群中\n\n
## 指令说明
- \`nkc [num]\` 获取牛客即将进行的比赛，参数为所展示的数量，可选，默认为全部
- \`nkr <user_name>\` 获取牛客最后一场比赛的Rating变化，参数为用户名，支持模糊查询
`;

export interface Config {
  推送设置: {
    groupId: string; // 群号
    weekly: boolean; // 周赛推送
    monthly: boolean; // 月赛推送
    training: boolean; // 练习赛推送
    challenge: boolean; // 挑战赛推送
  }[];
}

export const Config: Schema<Config> = Schema.object({
  推送设置: Schema.array(
    Schema.object({
      groupId: Schema.string().description("群号").required(true),
      weekly: Schema.boolean().default(true).description("周赛推送"),
      monthly: Schema.boolean().default(true).description("月赛推送"),
      training: Schema.boolean().default(true).description("练习赛推送"),
      challenge: Schema.boolean().default(false).description("挑战赛推送"),
    })
  )
    .role("table")
    .default([
      {
        groupId: "example",
        weekly: true,
        monthly: false,
        training: true,
        challenge: true,
      },
    ]),
});

async function getUserInfo(username: string) {
  const ts = Date.now();
  const url = `https://gw-c.nowcoder.com/api/sparta/pc/search?_= ${ts}`.replace(
    "?_= ",
    "?_="
  );

  const payload = {
    page: 1,
    pageSize: 20,
    query: username,
    type: "user",
    searchType: "历史搜索",
    subType: 0,
    uiType: 0,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json;charset=UTF-8",
      Origin: "https://www.nowcoder.com",
      Referer: "https://www.nowcoder.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/138.0.0.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { userId: "-2", avatarUrl: "", username: "" };
  }

  const json = await res.json();
  // console.log(json);
  // console.log(json.data?.records);

  const totalPage = Math.min(5, json?.data?.totalPage) || 0;

  const users: any[] = json?.data?.records || [];
  if (users.length === 0) return { userId: "-1", avatarUrl: "", username: "" };
  // console.log(totalPage);

  //遍历前5页，共100人
  for (let i = 2; i <= totalPage; i++) {
    payload.page = i;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json;charset=UTF-8",
        Origin: "https://www.nowcoder.com",
        Referer: "https://www.nowcoder.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/114.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { userId: "-2", avatarUrl: "", username: "" };
    }
    const tmp = await res.json();
    // console.log(tmp);
    const newUsers: any[] = tmp?.data?.records || [];
    users.push(...newUsers);
  }
  // console.log(users);
  const exact = users.find((u) => u.nickname === username);
  const uid = exact ? exact.userId : users[0].userId;
  const avatarUrl = exact ? exact.headImgUrl : users[0].headImgUrl;
  const resname = exact ? exact.nickname : users[0].nickname;
  console.log(`获取用户信息: ${resname} uid: ${uid} avatarUrl: ${avatarUrl}`);
  return {
    userId: uid?.toString() || "-1",
    avatarUrl: avatarUrl || "",
    username: resname,
  };
}

async function getHistory(userId: string) {
  const url = `https://ac.nowcoder.com/acm/contest/rating-history?token=&uid=${userId}`;
  //返回json
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Connection: "keep-alive",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(`Error fetching data: ${data.message}`);
    }
    let result = { id: "", rating: 0, contestname: "", rank: 0, change: 0 };
    // return data.data;
    if (data.data.length > 0) {
      const latest = data.data[data.data.length - 1];
      result.id = userId;
      result.rating = latest.rating;
      result.contestname = latest.contestName;
      result.rank = latest.rank;
      result.change = latest.changeValue;
    }
    return result;
  } catch (error) {
    console.error("Fetch error:", error);
    return "获取失败";
  }
}

async function renderHTML(html: string) {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html);
  await page.setViewport({ width: 600, height: 400 });
  await page.evaluate(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
  });
  const imageBuffer = await page.screenshot({
    fullPage: false,
    clip: { x: 0, y: 0, width: 600, height: 400 },
  });
  await browser.close();
  return h.image(imageBuffer, "image/png");
}

interface ContestInfo {
  id: string;
  name: string;
  logo: string;
  contestTime: string;
  countdown: string;
}

async function getContestList(): Promise<ContestInfo[]> {
  const contests: ContestInfo[] = [];
  const url = "https://ac.nowcoder.com/acm/contest/vip-index";
  try {
    const res = await fetch(url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/114.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const html = await res.text();

    //所有的比赛div块
    const allContestDivs = [];
    const divPattern =
      /<div[^>]*data-id="(\d+)"[^>]*class="platform-item js-item[^"]*"[^>]*([\s\S]*?)(?=<div[^>]*data-id="|<\/div>\s*<\/div>|$)/g;
    let match;
    while ((match = divPattern.exec(html)) !== null) {
      allContestDivs.push({
        id: match[1],
        content: match[0],
      });
    }
    for (const contestDiv of allContestDivs) {
      const contestId = contestDiv.id;
      const contestHtml = contestDiv.content;
      try {
        const decodedHtml = contestHtml
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

        const nameMatch = decodedHtml.match(
          /<a[^>]*href="\/acm\/contest\/\d+"[^>]*target="_blank"[^>]*>([^<]+)<\/a>/
        );
        const name = nameMatch ? nameMatch[1].trim() : "";
        // console.log(`比赛名称: ${name}`);

        // logo
        const logoMatch = decodedHtml.match(/<img[^>]*src="([^"]+)"/);
        const logo = logoMatch ? logoMatch[1] : "";

        // 比赛时间
        const timeMatch = decodedHtml.match(/比赛时间：([^<]+)/);
        const contestTime = timeMatch
          ? timeMatch[1].trim().replace(/\s+/g, " ")
          : "";

        if (name) {
          // 解析比赛开始时间
          let isUpcoming = true;

          const startTimeMatch = contestTime.match(
            /(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/
          );

          if (startTimeMatch) {
            const contestStartTimeStr = startTimeMatch[1];
            const contestStartTime = new Date(contestStartTimeStr);
            const now = new Date();
            isUpcoming = contestStartTime > now;
          } else {
            isUpcoming = true;
          }

          // 计算倒计时
          let countdown = "";
          if (startTimeMatch) {
            const contestStartTimeStr = startTimeMatch[1];
            const contestStartTime = new Date(contestStartTimeStr);
            const now = new Date();
            const timeDiff = contestStartTime.getTime() - now.getTime();

            if (timeDiff > 0) {
              const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
              const hours = Math.floor(
                (timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
              );
              const minutes = Math.floor(
                (timeDiff % (1000 * 60 * 60)) / (1000 * 60)
              );
              const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

              countdown = `${days}天${hours}小时${minutes}分${seconds}秒`;
            }
          }

          if (isUpcoming) {
            contests.push({
              id: contestId,
              name,
              logo,
              contestTime,
              countdown,
            });
          }
        } else {
        }
      } catch (parseError) {
        console.error(`解析比赛ID ${contestId} 失败:`, parseError);
        return [];
      }
    }
    return contests;
  } catch (error) {
    console.error("获取比赛列表失败:", error);
    return [];
  }
}

function scoreColor(score: number) {
  if (score < 700) return "#b4b4b4";
  if (score < 1100) return "#c177e7";
  if (score < 1500) return "#5ea1f4";
  if (score < 2000) return "#25bb9b";
  if (score < 2400) return "#ffd700";
  if (score < 2800) return "#ff8800";
  return "#ff020a";
}
export function apply(ctx: Context, cfg: Config) {
  ctx
    .command("nkr <user_name>", "获取牛客最后一场比赛的Rating变化")
    .usage("参数为用户名，支持模糊查询")
    .action(async ({ session }, name) => {
      getUserInfo(name).then((result) => {
        // console.log(result);
        if (result.userId === "-1") {
          session.send("未找到用户");
          return;
        } else if (result.userId === "-2") {
          session.send("获取用户信息失败");
          return;
        }
        const resname = result.username;
        getHistory(result.userId).then(async (data) => {
          if (typeof data === "string") {
            session.send(data);
            return;
          }
          const { rating, contestname, rank, change } = data;
          if (contestname === "") {
            session.send(`用户"${resname}"暂无比赛记录`);
          } else {
            const html = `
            <html>
              <head>
                <style>
                  body {
                    background: #ffffff;
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                    width: 100vw;
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                  .card {
                    background: ${scoreColor(rating)}55;
                    width: 100%;
                    height: 100%;
                    padding: 32px;
                    box-sizing: border-box;
                    box-shadow: 0 4px 6px ${scoreColor(rating)}44;
                    border: none;
                  }
                  .header {
                    margin-bottom: 20px;
                    border-bottom: 2px solid ${scoreColor(rating)};
                    padding-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                  }
                  .avatar {
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 2px solid ${scoreColor(rating)};
                  }
                  .username {
                    font-size: 24px;
                    color: ${scoreColor(rating)};
                    font-weight: bold;
                  }
                  .contest {
                    font-size: 18px;
                    color: #495057;
                    margin: 12px 0;
                  }
                  .stats {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    margin-top: 20px;
                  }
                  .stat-item {
                    background: white;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                  }
                  .stat-label {
                    font-size: 14px;
                    color: #6c757d;
                    margin-bottom: 4px;
                  }
                  .stat-value {
                    font-size: 20px;
                    color: #212529;
                    font-weight: bold;
                  }
                  .change {
                    color: ${change > 0 ? "#28a745" : "#dc3545"};
                  }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="header">
                    ${
                      result.avatarUrl
                        ? `<img src="${result.avatarUrl}" alt="${resname}" class="avatar">`
                        : ""
                    }
                    <div class="username">${resname}</div>
                  </div>
                  <div class="contest">${contestname}</div>
                  <div class="stats">
                    <div class="stat-item">
                      <div class="stat-label">排名</div>
                      <div class="stat-value">#${rank}</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-label">当前 Rating</div>
                      <div class="stat-value" style="color: ${scoreColor(
                        rating
                      )}">${rating}</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-label">赛前 Rating</div>
                      <div class="stat-value" style="color: ${scoreColor(
                        rating - change
                      )}">${rating - change}</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-label">Rating 变动</div>
                      <div class="stat-value change">${
                        change > 0 ? "+" : ""
                      }${change}</div>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `;
            const image = await renderHTML(html);
            session.send(image);
          }
        });
      });
    });

  ctx
    .command("nkc [num]", "获取牛客即将进行的比赛")
    .usage("参数为所展示的数量，可选")
    .action(async ({ session }, num) => {
      getContestList().then(async (contests) => {
        if (contests.length === 0) {
          session.send("获取比赛失败");
          return;
        }
        let message = ``;
        let len = 0;
        if (num === "0" || num === undefined || num === "") {
          console.log(num);
          message = `共 ${contests.length} 个即将开始的比赛：\n\n`;
          len = contests.length;
        } else if (num && !isNaN(Number(num))) {
          len = Number(num);
          if (len > contests.length) {
            len = contests.length;
          }
          message = `共 ${contests.length} 个即将开始的比赛，前 ${len} 场：\n\n`;
        } else {
          session.send("请输入正确的数字");
          return;
        }
        for (let i = 0; i < len; i++) {
          const contest = contests[i];

          // const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(
          //   contest.logo
          // )}&w=50&h=50&fit=cover`;
          message += `(${i + 1})\n`;
          // message += segment.image(proxyUrl) + "\n";

          message += `${contest.name}\n`;

          message += `开赛时间：${contest.contestTime.split("至")[0]}\n`;
          if (contest.countdown) {
            message += `距离开赛：${contest.countdown}\n`;
          }
          message += `比赛链接：https://ac.nowcoder.com/acm/contest/${contest.id}\n\n`;
        }
        session.send(message);
      });
    });

  ctx.cron("45 18 * * 5,0", async () => {
    getContestList().then(async (contests) => {
      const contest = contests[0];
      //检验最近的比赛是否在今天
      if (contest) {
        const contestTime = new Date(contest.contestTime.split("至")[0]);
        // const contestTime = new Date("2025-07-19  19:00:00   ");

        const now = new Date();
        if (
          contestTime.getDate() === now.getDate() &&
          contestTime.getMonth() === now.getMonth() &&
          contestTime.getFullYear() === now.getFullYear()
        ) {
          console.log("今天有比赛");
          let broadcastID = [];
          for (const group of cfg.推送设置) {
            if (!group.groupId || group.groupId === "example") continue;
            if (name.includes("周赛") && group.weekly) {
              const groupId = `onebot:${group.groupId}`;
              broadcastID.push(groupId);
            } else if (name.includes("月赛") && group.monthly) {
              const groupId = `onebot:${group.groupId}`;
              broadcastID.push(groupId);
            } else if (name.includes("练习赛") && group.training) {
              const groupId = `onebot:${group.groupId}`;
              broadcastID.push(groupId);
            } else if (name.includes("挑战赛") && group.challenge) {
              const groupId = `onebot:${group.groupId}`;
              broadcastID.push(groupId);
            }
          }
          const message = `今晚有${contest.name}\n比赛链接：https://ac.nowcoder.com/acm/contest/${contest.id}`;
          // console.log(message);
          if (broadcastID.length != 0) {
            ctx.broadcast(broadcastID, message);
          }
        } else {
          console.log("今天没有比赛");
          return;
        }
      }
    });
  });
  // ctx.command("广播测试,不要使用").action(async ({ session }) => {
  //   const message = `测试消息`;
  //   let broadcastID = [];
  //   for (const group of cfg.推送设置) {
  //     const groupId = `onebot:${group.groupId}`;
  //     broadcastID.push(groupId);
  //   }
  //   ctx.broadcast(broadcastID, message);
  //   session.send("测试消息已发送到群组");
  // });
}
