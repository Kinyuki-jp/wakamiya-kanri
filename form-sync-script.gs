// =================================================================
// 若宮こういち後援会 - Googleフォーム → 管理ツール 自動連携スクリプト
// =================================================================
// 設置場所：Googleフォーム編集画面 → 右上「︙」→「スクリプト エディタ」
// このスクリプトはフォームに紐付くため、トリガーは「フォームから・フォーム送信時」
// 必要なスクリプトプロパティ：GH_TOKEN（GitHub Fine-grained Token）
// =================================================================

const REPO = 'Kinyuki-jp/wakamiya-kanri';
const FILE = 'supporters.json';

function onFormSubmit(e) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
    if (!token) { Logger.log('ERROR: GH_TOKEN not set'); return; }

    // フォーム回答を質問タイトル→回答のマップに変換
    const itemResponses = e.response.getItemResponses();
    const a = {};
    itemResponses.forEach(function(ir) {
      a[ir.getItem().getTitle()] = ir.getResponse();
    });
    Logger.log('Form answers: ' + JSON.stringify(a));

    // 氏名と同意チェック
    const name = String(a['お名前'] || '').trim();
    if (!name) { Logger.log('Skip: empty name'); return; }
    const consent = String(a['個人情報利用目的への同意'] || '').trim();
    if (consent === '同意しない') { Logger.log('Skip: no consent'); return; }

    const tel = String(a['電話番号'] || '').trim().substring(0, 20);
    const toStr = function(x) { return Array.isArray(x) ? x.join('・') : String(x || ''); };

    // 詳細情報をnoteフィールドにまとめる
    const noteParts = [];
    if (a['応援メッセージ・ご要望']) noteParts.push('【メッセージ】' + a['応援メッセージ・ご要望']);
    if (a['活動内容の認知度']) noteParts.push('【認知度】' + a['活動内容の認知度']);
    if (a['今後参加したい活動']) noteParts.push('【希望活動】' + toStr(a['今後参加したい活動']));
    if (a['活動報告の受け取り方法']) noteParts.push('【受取方法】' + toStr(a['活動報告の受け取り方法']));
    if (a['後援会を知ったきっかけ']) noteParts.push('【きっかけ】' + toStr(a['後援会を知ったきっかけ']));
    if (a['今後の情報配信希望']) noteParts.push('【情報配信】' + a['今後の情報配信希望']);
    if (a['活動への支援意欲']) noteParts.push('【支援意欲】' + a['活動への支援意欲']);

    // 支援者オブジェクトを構築
    const supporter = {
      id: String(Date.now()),
      name: name.substring(0, 50),
      area: String(a['お住まいの地区'] || 'その他').trim(),
      tel: tel,
      relation: String(a['若宮との関係性'] || 'フォーム登録').trim(),
      level: '支持者',
      email: '',
      age: String(a['ご年齢層'] || '').trim(),
      gender: String(a['ご性別'] || '').trim(),
      addr: '',
      note: noteParts.join(' / ').substring(0, 500),
      created: new Date().toISOString()
    };

    // GitHub API ヘッダー
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    const url = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE;

    // 現在のJSONを取得
    const getResp = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
    if (getResp.getResponseCode() !== 200) {
      Logger.log('GET failed: ' + getResp.getContentText());
      return;
    }
    const fileData = JSON.parse(getResp.getContentText());
    const sha = fileData.sha;
    const decoded = Utilities.newBlob(
      Utilities.base64Decode(fileData.content.replace(/\n/g, ''))
    ).getDataAsString('UTF-8');
    const current = JSON.parse(decoded);

    // 電話番号重複チェック
    if (tel) {
      for (let i = 0; i < current.supporters.length; i++) {
        if (current.supporters[i].tel === tel) {
          Logger.log('Skip duplicate: ' + tel);
          return;
        }
      }
    }

    // 先頭に追加
    current.supporters.unshift(supporter);
    current.updated = new Date().toISOString();

    // GitHubに書き戻し
    const newJson = JSON.stringify(current, null, 2);
    const newContent = Utilities.base64Encode(
      Utilities.newBlob(newJson, 'application/json').getBytes()
    );
    const putResp = UrlFetchApp.fetch(url, {
      method: 'put',
      headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
      payload: JSON.stringify({
        message: 'フォーム登録: ' + supporter.name + '（' + supporter.area + '）',
        content: newContent,
        sha: sha
      }),
      muteHttpExceptions: true
    });

    const code = putResp.getResponseCode();
    if (code === 200 || code === 201) {
      Logger.log('Success: ' + supporter.name);
    } else {
      Logger.log('PUT failed (' + code + '): ' + putResp.getContentText());
    }
  } catch (err) {
    Logger.log('Exception: ' + err.toString());
  }
}
