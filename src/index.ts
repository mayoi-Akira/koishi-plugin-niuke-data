import { Context, Schema, h } from "koishi";
import puppeteer from "puppeteer";

export const name = "niuke-data";

export interface Config {}

export const Config: Schema<Config> = Schema.object({});

interface SearchPayload {
  page: number;
  pageSize: number;
  query: string;
  type: "user";
  searchType: string;
  subType: number;
  uiType: number;
}

async function getUserInfo(username: string) {
  const ts = Date.now();
  const url = `https://gw-c.nowcoder.com/api/sparta/pc/search?_= ${ts}`.replace(
    "?_= ",
    "?_="
  );

  const payload: SearchPayload = {
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
  const totalPage = json?.data?.totalPage >= 5 ? 5 : json?.data?.totalPage || 0;

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
    console.log(tmp);
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

function scoreColor(score: number) {
  if (score < 700) return "#b4b4b4";
  if (score < 1100) return "#c177e7";
  if (score < 1500) return "#5ea1f4";
  if (score < 2000) return "#25bb9b";
  if (score < 2400) return "#ffd700";
  if (score < 2800) return "#ff8800";
  return "#ff020a";
}
export function apply(ctx: Context) {
  ctx.command("nk <arg1>").action(async ({ session }, name) => {
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
  // ctx.command("test").action(async ({ session }) => {
  //   const html = `
  //   <html>
  //     <body style="background: #ffffff; font-size: 20px;">
  //       <h1>114</h1>
  //     </body>
  //   </html>`;
  //   const image = await renderHTML(html);
  //   session.send(image);
  // });
}
