# koishi-plugin-niuke-data

[![npm](https://img.shields.io/npm/v/koishi-plugin-niuke-data?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-niuke-data)

## 定期推送

插件将会在每周五和周日的18:45爬取牛客比赛信息；

若当天有 周赛 / 月赛 / 练习赛 / 挑战赛，将会根据对应配置推送到群中

## 指令说明

- `nkc [num]` 获取牛客即将进行的比赛，参数为所展示的数量，可选，默认为全部

- `nkr <user_name>` 获取牛客最后一场比赛的Rating变化，参数为用户名，支持模糊查询

- `nkrank ` 获取牛客排行榜

  1. ` -s, --size [size]`  每页的展示数量

  1. ` -k, --key [key]`    搜索关键字

  1. `-p, --page [page]`  页码

  1.  `-a, --all` 获取总榜，若使用这个，key参数会自动失效

  - 例如：`nkrank -k 大连民族大学 -s 10 -p 1`
