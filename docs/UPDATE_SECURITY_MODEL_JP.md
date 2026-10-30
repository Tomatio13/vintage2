# 自動更新のセキュリティモデル

VINTAGEの更新元は`Tomatio13/vintage2`のGitHub Releasesです。`electron-builder`が生成するupdate metadataとinstallerをRelease assetとして公開し、インストール済みアプリは`electron-updater`で確認します。

## 現在の防御

- 自動downloadと終了時の自動installを無効化し、ユーザー操作後だけ取得・適用する
- download完了イベントを受けるまでinstall処理を開始しない
- downgradeを明示的に無効化する
- update metadataに記録されたhashとsizeの検証は`electron-updater`へ委譲する
- Windowsでは署名済みinstallerと`publisherName`が構成されている場合、`electron-updater`の署名検証経路を利用できる
- Linux `.deb`は固定commandとargvで`pkexec dpkg -i`へ渡す
- Electron fuseでASAR integrity検証とASAR限定loadを有効化する

## Releaseまたはmetadata侵害

GitHub repository、Release権限、GitHub Actions、依存するAction、publish tokenのいずれかが侵害されると、攻撃者がmetadataとassetを同時に置換できる可能性があります。metadata内のhashは転送中の破損やasset単独の差し替えには有効ですが、metadataも書き換えられる侵害に対する独立した信頼根にはなりません。

現在のworkflowにはWindows/macOS署名credentialの設定がなく、CIが生成するassetが常に署名・notarizeされるとは確認できません。署名されていないReleaseでは、repository/CI侵害に対するOS署名の防御を期待できません。

Linux packageは一般にWindows/macOSのようなアプリ単体署名検証経路を持たず、GitHub ReleaseとTLS、metadata hashへの依存が大きくなります。

## 必要な運用対策

- GitHub organization/repositoryの強いMFA、最小権限、branch/tag protection、environment approvalを使用する
- workflow Actionをcommit SHAへ固定し、変更をreviewする
- Windows code signingとmacOS signing/notarizationをRelease buildへ導入する
- 公開後にRelease asset、metadata hash、署名、versionを別経路で検証する
- 侵害時はReleaseを削除するだけでなく、publish権限を失効し、原因を除去して新しいversionを発行する
- downgradeは許可せず、修正版をより新しいversionとして配布する

## 未検証

- 実Release assetのmetadata hashと配布元
- Windows publisher署名
- macOS署名、notarization、Gatekeeper
- Linuxでの侵害asset検出と復旧訓練
- インストール済みアプリからのend-to-end更新
