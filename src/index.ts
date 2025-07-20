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
插件将会在每周五和周日的18:45爬取牛客比赛信息；\n\n若当天有 周赛 / 月赛 / 练习赛 / 挑战赛，将会根据下方对应配置推送到群中\n\n<br>\n\n
## 指令说明
1. \`nkc [num]\` 获取牛客即将进行的比赛，参数为所展示的数量，可选，默认为全部
    - 例如：\`nkc 5\` 获取即将开始的前5场比赛
2. \`nkr <user_name>\` 获取牛客最后一场比赛的Rating变化，参数为用户名，支持模糊查询
    - 例如：\`nkr 青木阳菜\` 获取用户\`青木阳菜\`的最后一场比赛的Rating变化
3. \`nkrank \` 获取牛客排行榜

    - 可用选项如下（全部可为空，若为空则使用默认值）:\n
      (1) \` -s, --size [size]\`  每页的展示数量\n
      (2) \` -k, --key [key]\`    搜索关键字\n
      (3) \`-p, --page [page]\`  页码\n
      (4)  \`-a, --all\` 获取总榜，若使用这个，key参数会自动失效\n
    - 例如：\`nkrank -k 大连民族大学 -s 10 -p 1\` 展示大连民族大学搜索结果的第1页的前10个人\n
<br>
    `;

export interface Config {
  排行榜查询默认参数: {
    每页数量: number; // 每页数量
    搜索词: string; // 搜索关键字
    页数: number; // 页码
  };
  推送设置: {
    groupId: string; // 群号
    weekly: boolean; // 周赛推送
    monthly: boolean; // 月赛推送
    training: boolean; // 练习赛推送
    challenge: boolean; // 挑战赛推送
  }[];
}

export const Config: Schema<Config> = Schema.object({
  排行榜查询默认参数: Schema.object({
    每页数量: Schema.number()
      .min(1)
      .max(50)
      .default(20)
      .description("每页展示数量"),
    搜索词: Schema.string().default("").description("搜索关键字"),
    页数: Schema.number().min(1).default(1).description("显示第几页"),
  }).role("table"),
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
    signal: AbortSignal.timeout(10000),
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
      signal: AbortSignal.timeout(10000),
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
  if (users.length === 0) {
    return { userId: "-1", avatarUrl: "", username: "" };
  }
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
      signal: AbortSignal.timeout(10000),
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

async function renderRatingHTML(html: string) {
  let browser;
  try {
    browser = await puppeteer.launch({ args: ["--no-sandbox"] });
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
    return h.image(imageBuffer, "image/png");
  } catch (error) {
    console.error("Error rendering HTML:", error);
    return h.text("渲染HTML失败");
  } finally {
    if (browser) await browser.close();
  }
}

async function renderRankingHTML(
  users: any[],
  pageSize: number,
  pageNum: number
) {
  const itemHeight = 60; // 每个用户项的高度
  const totalHeight = users.length * itemHeight; // 总高度

  const html = `
    <html>
      <head>
        <style>
          body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            margin: 0;
            padding: 0;
            width: 600px;
            height: ${totalHeight}px;
            box-sizing: border-box;
          }
          .ranking-list {
            background: rgba(255, 255, 255, 0.95);
            width: 100%;
            height: 100%;
            padding: 0;
            box-sizing: border-box;
          }
          .ranking-item {
            display: flex;
            align-items: center;
            padding: 16px 20px;
            background: rgba(255, 255, 255, 0.9);
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
            height: ${itemHeight}px;
            box-sizing: border-box;
          }
          .ranking-item:last-child {
            border-bottom: none;
          }
          .rank-number {
            font-size: 18px;
            font-weight: bold;
            color: #666;
            min-width: 50px;
            text-align: center;
          }
          .user-info {
            flex: 1;
            margin-left: 20px;
          }
          .username {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 4px;
          }
          .school {
            font-size: 12px;
            color: #888;
          }
          .rating {
            font-size: 18px;
            font-weight: bold;
            min-width: 80px;
            text-align: right;
            margin-right: 10px;
          }
        </style>
      </head>
      <body>
        <div class="ranking-list">
          ${users
            .map((user, index) => {
              const rank = (pageNum - 1) * pageSize + index + 1;
              return `
              <div class="ranking-item">
                <div class="rank-number">#${rank}</div>
                <div class="user-info">
                  <div class="username" style="color: ${scoreColor(
                    user.rating
                  )}">${user.username}</div>
                  ${
                    user.school
                      ? `<div class="school">${user.school}</div>`
                      : ""
                  }
                </div>
                <div class="rating" style="color: ${scoreColor(user.rating)}">${
                user.rating
              }</div>
              </div>
            `;
            })
            .join("")}
        </div>
      </body>
    </html>
  `;

  let browser;
  try {
    browser = await puppeteer.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html);
    await page.setViewport({ width: 600, height: totalHeight });
    await page.evaluate(() => {
      document.body.style.margin = "0";
      document.body.style.padding = "0";
    });

    const imageBuffer = await page.screenshot({
      fullPage: true,
    });
    return h.image(imageBuffer, "image/png");
  } catch (err) {
    console.error("Error rendering HTML:", err);
    return h.text("渲染HTML失败");
  } finally {
    await browser.close();
  }
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
      if (name.length > 20) {
        session.send("输入用户名过长");
        return;
      }
      if (name.length === 0) {
        session.send("请输入用户名");
        return;
      }
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
            const image = await renderRatingHTML(html);
            session.send(image);
          }
        });
      });
    });

  ctx
    .command("nkc [num:number]", "获取牛客即将进行的比赛")
    .usage("参数为所展示的数量，可选")
    .action(async ({ session }, num) => {
      getContestList().then(async (contests) => {
        if (contests.length === 0) {
          session.send("获取比赛失败");
          return;
        }
        let message = ``;
        let len = 0;
        if (num === undefined || num === null) {
          console.log(num);
          message = `共 ${contests.length} 个即将开始的比赛：\n\n`;
          len = contests.length;
        } else if (num && !isNaN(Number(num))) {
          len = Number(num);
          if (len > contests.length) {
            len = contests.length;
          }
          if (len <= 0) {
            session.send("请输入正确的数字");
            return;
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

  ctx
    .command("nkrank", "获取牛客排行榜")
    .option("size", "-s [size] 每页的展示数量(1 - 50)", {
      fallback: cfg.排行榜查询默认参数.每页数量,
    })
    .option("key", "-k [key] 搜索关键字", {
      fallback: cfg.排行榜查询默认参数.搜索词,
    })
    .option("page", "-p [page] 页码", {
      fallback: cfg.排行榜查询默认参数.页数,
    })
    .option("all", "-a 获取总榜，使用这个的话key参数会失效", {
      fallback: false,
    })
    .action(async ({ options, session }) => {
      console.log(options);
      const all = options.all || false;
      const pageSize = options.size || cfg.排行榜查询默认参数.每页数量;
      let searchKey = options.key || cfg.排行榜查询默认参数.搜索词;
      let page = options.page || cfg.排行榜查询默认参数.页数;
      if (all) searchKey = "";
      if (pageSize <= 0 || pageSize > 50) {
        session.send("每页数量必须在1到50之间");
        return;
      }
      if (page <= 0) {
        session.send("页码放负数？你当我是python啊");
        return;
      }
      if (searchKey.length > 20) {
        session.send("搜索词过长，不得超过20");
        return;
      }
      console.log(`搜索词: ${searchKey}, 每页数量: ${pageSize}, 页码: ${page}`);
      // console.log("1");
      const url = `https://ac.nowcoder.com/acm/contest/rating-index?searchUserName=${encodeURIComponent(
        searchKey
      )}&pageSize=${pageSize}&page=${page}`;
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
        const html = await res.text();

        const re = /共\s*([0-9]+)\s*条/;
        const countMatch = html.match(re);
        let count;
        if (countMatch) {
          count = Number(countMatch[1]);
          console.log(`搜索结果数量：${count || "空"}`);
        }
        if (!count && page != 1) {
          session.sendQueued(`诶？搜索结果貌似只有一页呢，那就仅展示第一页吧`);
          page = 1;
        } else {
          if (page > Math.ceil(count / pageSize)) {
            session.sendQueued("诶？好像没有那么多人呢");
            session.sendQueued(
              `总人数为 ${count}，展示数量为 ${pageSize} 的话，最多只能到第 ${Math.ceil(
                count / pageSize
              )} 页哦`
            );
            return;
          }
        }
        // 解析HTML，提取用户信息
        const users = [];
        // 匹配每一行用户数据的tr标签
        const trPattern = /<tr\s+data-isFollowedByHost[^>]*>([\s\S]*?)<\/tr>/g;
        let trMatch;
        while ((trMatch = trPattern.exec(html)) !== null) {
          const trContent = trMatch[1];
          // 提取用户名
          const usernameMatch = trContent.match(
            /<span class="rate-score\d*">([^<]+)<\/span>/
          );
          const username = usernameMatch ? usernameMatch[1].trim() : "";
          // 提取学校
          const schoolMatch = trContent.match(
            /<a href="\/acm\/contest\/rating-index\?searchUserName=([^"]+)&[^"]*">([^<]+)<\/a>/
          );
          const school = schoolMatch ? schoolMatch[2].trim() : "";
          // 提取Rating
          const ratingMatches = trContent.match(
            /<span class="rate-score\d*">([^<]+)<\/span>/g
          );
          const rating =
            ratingMatches && ratingMatches.length > 1
              ? parseInt(
                  ratingMatches[ratingMatches.length - 1]
                    .replace(/<[^>]*>/g, "")
                    .trim()
                )
              : 0;

          if (username && rating) {
            users.push({
              username,
              school,
              rating,
            });
          }
        }

        if (users.length === 0) {
          session.send("未找到排行榜数据，请确认搜索词是否正确");
          return;
        }
        console.log("users:", users);
        // 渲染排行榜图片并发送
        const rankingImage = await renderRankingHTML(users, pageSize, page);
        session.send(rankingImage);
      } catch (err) {
        console.error("获取排行榜失败:", err);
        session.send("获取排行榜失败");
        return;
      }
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
            if (contest.name.includes("周赛") && group.weekly) {
              const groupId = `onebot:${group.groupId}`;
              broadcastID.push(groupId);
            } else if (contest.name.includes("月赛") && group.monthly) {
              const groupId = `onebot:${group.groupId}`;
              broadcastID.push(groupId);
            } else if (contest.name.includes("练习赛") && group.training) {
              const groupId = `onebot:${group.groupId}`;
              broadcastID.push(groupId);
            } else if (contest.name.includes("挑战赛") && group.challenge) {
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
