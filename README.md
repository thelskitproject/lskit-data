# LSKit Data

独立维护教室二维码数据。网站代码在 [thelskitproject.github.io](https://github.com/thelskitproject/thelskitproject.github.io)。

## 收录

在网站新增页填写教室信息、还原照片、复制记录，再到本仓库提交「新增教室二维码」Issue，将 JSON 粘贴到教室记录栏，保留 `[新增教室]` 标题前缀。
机器人校验并创建或更新 PR，维护者核对后手动合并。无效记录会收到说明，编辑 Issue 后重新校验。

记录只包含 buildingName、roomName（未知为 null）、roomNumber 和 matrix。matrix 是原始黑白模块按行、最高位优先打包的 Base64，末尾补零，不重新编码二维码内容。教室资料和矩阵公开，照片不会上传。

## 设置

Settings → Actions → General → Workflow permissions 中开启 **Allow GitHub Actions to create and approve pull requests**。工作流使用 GITHUB_TOKEN，无需个人 Token。
机器人 PR 不会自动触发其他 pull_request 工作流，因此二维码校验在创建 PR 前运行。不会自动合并。同一教学楼和房间号的已有记录需要由维护者更新。

## 本地工具

Node.js 24、pnpm 11：

```sh
pnpm install
pnpm test
pnpm import:qr /path/to/photo.png --building-name "Building" --room-name "Room" --room-number "G.06"
```

数据合并后，网站下次构建或执行 `pnpm sync:data` 会获取最新记录；不会自动触发另一个仓库的部署。
