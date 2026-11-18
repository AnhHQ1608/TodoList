// Chỉ dịch chữ giao diện; nội dung task, tên thư mục và tên tài khoản giữ nguyên.
(() => {
  const key='focus-language-v1';
  const languages={vi:'vi-VN',en:'en-US',ja:'ja-JP'};
  let language='vi';
  try { const saved=localStorage.getItem(key);if(languages[saved])language=saved; } catch {}
  const rows=[
    ['Ngôn ngữ','Language','言語'],['Contact','Contact','お問い合わせ'],['Add Task','Add Task','タスクを追加'],['All / Active / Completed','All / Active / Completed','すべて / 未完了 / 完了'],
    ['Trình phát YouTube','YouTube player','YouTubeプレーヤー'],['Mở trên YouTube ↗','Open on YouTube ↗','YouTubeで開く ↗'],['Dừng và đóng video','Stop and close video','動画を停止して閉じる'],['Không phát được? Mở trên YouTube hoặc chọn bài khác.','Cannot play? Open on YouTube or choose another song.','再生できない場合はYouTubeで開くか、別の曲を選んでください。'],['Bấm Phát để xem video YouTube.','Press Play to watch the YouTube video.','再生ボタンを押してYouTube動画をご覧ください。'],['Không phát được video. Mở trên YouTube hoặc chọn bài khác.','Cannot play this video. Open on YouTube or choose another song.','動画を再生できません。YouTubeで開くか、別の曲を選んでください。'],
    ['Chọn ngôn ngữ hiển thị','Choose your display language','表示言語を選択'],
    ['Mở menu','Open menu','メニューを開く'],['Đóng menu','Close menu','メニューを閉じる'],
    ['Không gian của bạn','Your space','あなたの空間'],
    ['Hướng dẫn sử dụng','How to use','使い方'],['Âm thanh','Sound','サウンド'],['Thông báo','Notifications','通知'],['Quản trị','Admin','管理'],
    ['Giao diện tối','Dark mode','ダークモード'],['Giao diện sáng','Light mode','ライトモード'],['Chế độ sáng','Light mode','ライトモード'],
    ['MỖI NGÀY, MỘT BƯỚC TIẾN','ONE STEP FORWARD, EVERY DAY','毎日、一歩ずつ'],
    ['KHÔNG GIAN LÀM VIỆC CỦA BẠN','YOUR PERSONAL WORKSPACE','あなたのワークスペース'],
    ['Bớt bận rộn.','Less busy.','忙しさを減らして。'],['Thêm tập trung.','More focus.','集中を増やそう。'],
    ['Ghi lại điều cần làm, tập trung vào điều quan trọng.','Write down your tasks. Focus on what matters.','やることを書き出して、大切なことに集中しよう。'],
    ['Công việc của bạn','Your tasks','あなたのタスク'],['Công việc trong tuần','Tasks this week','今週のタスク'],
    ['KẾ HOẠCH TUẦN','WEEKLY PLAN','週間プラン'],['Tuần này','This week','今週'],['Tuần trước','Previous week','前の週'],['Tuần sau','Next week','次の週'],
    ['T2','Mon','月'],['T3','Tue','火'],['T4','Wed','水'],['T5','Thu','木'],['T6','Fri','金'],['T7','Sat','土'],['CN','Sun','日'],
    ['Thứ Hai','Monday','月曜日'],['Thứ Ba','Tuesday','火曜日'],['Thứ Tư','Wednesday','水曜日'],['Thứ Năm','Thursday','木曜日'],['Thứ Sáu','Friday','金曜日'],['Thứ Bảy','Saturday','土曜日'],['Chủ nhật','Sunday','日曜日'],
    ['Tất cả','All','すべて'],['All','All','すべて'],['Active','Active','未完了'],['Completed','Completed','完了'],['Cả tuần','Whole week','週全体'],['Chưa xếp ngày','Unscheduled','日付未設定'],
    ['Bạn muốn hoàn thành điều gì?','What would you like to get done?','何を達成したいですか？'],['Công việc mới','New task','新しいタスク'],
    ['＋ Add Task','＋ Add Task','＋ タスクを追加'],['Lưu thay đổi','Save changes','変更を保存'],['Hủy sửa','Cancel editing','編集をキャンセル'],
    ['Lên lịch','Schedule','スケジュール'],['Không bắt buộc','Optional','任意'],['Ngày thực hiện / bắt đầu','Task / start date','実行日・開始日'],
    ['Lặp hằng tuần','Repeat weekly','毎週繰り返す'],['Các thứ lặp lại','Repeat on','繰り返す曜日'],
    ['Giờ deadline mỗi lần (không bắt buộc)','Deadline time for each occurrence (optional)','各回の締切時刻（任意）'],
    ['Mỗi ngày là một task riêng. Sửa task lặp sẽ cập nhật lịch lặp; bỏ chọn để dừng lặp.','Each day has its own task. Editing a recurring task updates the schedule; uncheck to stop repeating.','日ごとに別のタスクが作られます。繰り返しタスクの編集で予定を更新し、チェックを外すと繰り返しを停止します。'],
    ['Mục công việc','Category','カテゴリー'],['Chưa phân loại','Uncategorized','未分類'],['Tất cả mục','All categories','すべてのカテゴリー'],['CHỌN MỤC CÔNG VIỆC','CHOOSE A CATEGORY','カテゴリーを選択'],
    ['Thư mục','Folders','フォルダー'],['＋ Tạo / quản lý','＋ Create / manage','＋ 作成・管理'],['＋ Tạo mục','＋ Create category','＋ カテゴリーを作成'],
    ['Tên mục mới','New category name','新しいカテゴリー名'],['Ví dụ: Học tập, Công việc, Cá nhân…','e.g. Study, Work, Personal…','例：勉強、仕事、プライベート…'],
    ['Biểu tượng','Icon','アイコン'],['Biểu tượng thư mục','Folder icon','フォルダーのアイコン'],['Xóa mục vẫn giữ task.','Deleting a category keeps its tasks.','カテゴリーを削除してもタスクは残ります。'],['Xóa mục này','Delete this category','このカテゴリーを削除'],
    ['Deadline (không bắt buộc)','Deadline (optional)','締切（任意）'],['Giờ deadline (không bắt buộc)','Deadline time (optional)','締切時刻（任意）'],
    ['Chọn ngày','Choose a date','日付を選択'],['Chọn giờ','Choose a time','時刻を選択'],['Chọn ngày & giờ','Choose date & time','日時を選択'],
    ['Chọn deadline','Choose a deadline','締切を選択'],['Chọn giờ deadline','Choose deadline time','締切時刻を選択'],['LÊN LỊCH HOÀN THÀNH','PLAN YOUR DEADLINE','締切を設定'],
    ['Tháng trước','Previous month','前の月'],['Tháng sau','Next month','次の月'],['THỜI GIAN','TIME','時刻'],['Định dạng 24 giờ','24-hour format','24時間形式'],['Giờ','Hour','時'],['Phút','Minute','分'],
    ['Nhập giờ','Enter time','時刻を入力'],['Hôm nay','Today','今日'],['Ngày mai','Tomorrow','明日'],['Bỏ deadline','Clear deadline','締切を解除'],['Hủy','Cancel','キャンセル'],['Xác nhận deadline','Confirm deadline','締切を確定'],['Xác nhận ngày','Confirm date','日付を確定'],
    ['Sửa','Edit','編集'],['Khôi phục','Restore','復元'],['Đã khôi phục','Restored','復元済み'],['Đã hoàn thành','Completed','完了'],['Đang quá hạn','Overdue','期限切れ'],['Không còn trong danh sách','No longer in the list','リストにありません'],
    ['Lịch sử quá hạn','Overdue history','期限切れの履歴'],['Chưa có công việc quá hạn.','No overdue tasks yet.','期限切れのタスクはありません。'],
    ['Giữ lại task đã lỡ hạn. Khôi phục với deadline mới để tiếp tục thực hiện.','Missed tasks are kept here. Restore with a new deadline to continue.','期限を過ぎたタスクを保存します。新しい締切で復元して続けられます。'],
    ['⚠ Công việc quá hạn','⚠ Overdue tasks','⚠ 期限切れのタスク'],['Xem lịch sử & khôi phục','View history & restore','履歴を表示・復元'],['Không có deadline','No deadline','締切なし'],['Đang tự xóa…','Deleting automatically…','自動削除中…'],
    ['Sẵn sàng cho một ngày hiệu quả?','Ready for a productive day?','充実した一日を始めませんか？'],['Thêm công việc đầu tiên và bắt đầu từ những điều nhỏ.','Add your first task and start small.','最初のタスクを追加して、小さな一歩から始めよう。'],
    ['Không có công việc đang chờ!','No pending tasks!','未完了のタスクはありません！'],['Bạn có thể thêm công việc mới khi sẵn sàng.','Add a new task whenever you are ready.','準備ができたら新しいタスクを追加しましょう。'],
    ['Chưa có công việc hoàn thành','No completed tasks yet','完了したタスクはまだありません'],['Đánh dấu một công việc để ghi nhận bước tiến của bạn.','Complete a task to celebrate your progress.','タスクを完了して、進歩を記録しよう。'],
    ['Họ và tên','Full name','氏名'],['Lưu họ tên','Save name','氏名を保存'],['Đăng xuất','Log out','ログアウト'],['Đã đồng bộ','Synced','同期済み'],['Đang đồng bộ…','Syncing…','同期中…'],['Thử lại','Try again','再試行'],['Tải lại','Reload','再読み込み'],['Nhập task cũ trên máy','Import local tasks','端末のタスクを取り込む'],
    ['Góc tập trung của bạn.','Your space to focus.','あなたの集中スペース。'],['Đang tải tài khoản…','Loading your account…','アカウントを読み込み中…'],['Mỗi ngày, một bước tiến.','One step forward, every day.','毎日、一歩ずつ。'],
    ['Đăng nhập','Log in','ログイン'],['Đăng ký','Sign up','新規登録'],['Tên đăng nhập','Username','ユーザー名'],['Mật khẩu','Password','パスワード'],['Nhập lại mật khẩu','Confirm password','パスワード（確認）'],['Tạo tài khoản','Create account','アカウントを作成'],
    ['Chào mừng trở lại.','Welcome back.','おかえりなさい。'],['Bắt đầu một ngày mới.','Start a new day.','新しい一日を始めよう。'],['KHÔNG GIAN CỦA RIÊNG BẠN','YOUR OWN SPACE','あなただけの空間'],['Một tài khoản. Công việc của bạn, trên mọi thiết bị.','One account. Your tasks, on every device.','ひとつのアカウントで、どの端末でもタスクを管理。'],
    ['Hiện','Show','表示'],['Ẩn','Hide','非表示'],['Hiện mật khẩu','Show password','パスワードを表示'],['Ẩn mật khẩu','Hide password','パスワードを隠す'],['Ít nhất 10 ký tự','At least 10 characters','10文字以上'],['Đang xử lý…','Working…','処理中…'],
    ['3–32 chữ không dấu, số, dấu chấm hoặc gạch dưới.','3–32 Latin letters, numbers, dots or underscores.','半角英数字・ピリオド・アンダースコアで3〜32文字。'],
    ['Giữ đăng nhập 10 ngày. Không dùng chung mật khẩu với tài khoản khác.','Stay signed in for 10 days. Use a unique password.','ログインは10日間保持されます。他のアカウントと異なるパスワードを使用してください。'],
    ['Website ghi nhận loại thao tác và thiết bị để quản trị. Nội dung task thuộc tài khoản của bạn.','The site records action types and devices for administration. Task content belongs to your account.','管理のため操作の種類と端末を記録します。タスク内容はあなたのアカウントに属します。'],
    ['Bật thông báo','Enable notifications','通知を有効にする'],['Đã bật thông báo','Notifications enabled','通知は有効です'],['Gửi thử ngay','Send test now','今すぐテスト送信'],['Thử sau 5 giây','Test in 5 seconds','5秒後にテスト'],['Trợ giúp thông báo','Notification help','通知のヘルプ'],
    ['Không thấy banner? Kiểm tra quyền thông báo và Không làm phiền trong Windows. Giữ trang mở để nhận nhắc; tab ngủ có thể gây trễ. Nhắc khi đóng trang cần backend và push notification.','No banner? Check notification permissions and Windows Do not disturb. Keep the page open; sleeping tabs may delay reminders. Closed-page reminders require a backend and push notifications.','バナーが出ない場合は通知権限とWindowsの集中モードを確認してください。ページを開いたままにしてください。休止中のタブでは通知が遅れる場合があります。ページを閉じた状態での通知にはバックエンドとプッシュ通知が必要です。'],
    ['Thử cảnh báo','Test alert','警告音をテスト'],['Thử thông báo','Test notification sound','通知音をテスト'],['Nhạc nền','Background music','BGM'],['Bật nhạc','Enable music','音楽をオン'],['Tắt nhạc','Disable music','音楽をオフ'],['Phát','Play','再生'],['Tạm dừng','Pause','一時停止'],['Dừng lời chào','Stop greeting','挨拶を停止'],['⇄ Ngẫu nhiên','⇄ Random','⇄ ランダム'],['Âm lượng','Volume','音量'],['Chọn bài hát','Choose a song','曲を選択'],['Bài trước','Previous song','前の曲'],['Bài tiếp theo','Next song','次の曲'],['Đóng nhạc','Close player','プレーヤーを閉じる'],['Mở điều khiển nhạc','Open music player','音楽プレーヤーを開く'],
    ['Giọng chào tiếng Việt','Vietnamese greeting voice','ベトナム語の挨拶音声'],['Giọng Việt có sẵn','Built-in Vietnamese voice','内蔵ベトナム語音声'],['Lời chào tiếng Việt có sẵn trên web.','Vietnamese greeting audio is included on the site.','サイトにベトナム語の挨拶音声を用意しています。'],['Nghe lời chào','Preview greeting','挨拶を聴く'],['Đang phát lời chào tiếng Việt…','Playing the Vietnamese greeting…','ベトナム語の挨拶を再生中…'],['Đang đọc lời chào…','Playing greeting…','挨拶を再生中…'],['Đang tải nhạc…','Loading music…','音楽を読み込み中…'],['Đã tắt nhạc.','Music is off.','音楽はオフです。'],
    ['Chạm vào trang để nghe lời chào, sau đó nhạc sẽ phát.','Tap the page to hear the greeting, then music will play.','ページをタップすると挨拶の後に音楽が流れます。'],['Chạm vào trang để nghe lời chào và nhạc nền.','Tap the page to hear the greeting and music.','ページをタップして挨拶と音楽を聴こう。'],['Bấm Phát hoặc tương tác với trang để bật nhạc.','Press Play or interact with the page to start music.','再生ボタンを押すかページを操作すると音楽が始まります。'],
    ['Liên hệ Facebook','Contact on Facebook','Facebookで連絡'],['Sắp có','Coming soon','近日公開'],['Sắp xếp hôm nay, chạm tới ngày mai.','Organize today. Reach for tomorrow.','今日を整えて、明日へ。'],['(mở tab mới)','(opens a new tab)','（新しいタブで開きます）'],
    ['Bắt đầu từ một việc nhỏ, mỗi ngày.','Start with one small task, every day.','毎日、小さなタスクから始めよう。'],['Thêm công việc','Add tasks','タスクを追加'],['Lên kế hoạch tuần','Plan your week','週の計画を立てる'],['Sắp xếp & hoàn thành','Organize & complete','整理して完了する'],['Theo dõi deadline','Track deadlines','締切を確認'],['Bật nhắc nhở','Enable reminders','リマインダーを有効にする'],['Nghe nhạc & tùy chỉnh','Music & preferences','音楽と設定'],
    ['Thông tin và liên hệ','Information & contact','情報・お問い合わせ'],['Chức năng','Features','機能'],['Tài khoản','Account','アカウント'],
    ['Focus List — Công việc của bạn','Focus List — Your tasks','Focus List — あなたのタスク'],['Đăng nhập · Focus List','Log in · Focus List','ログイン · Focus List'],
    ['Có bản sửa chưa đồng bộ trên máy và bản mới trên máy chủ. Bạn có thể tải bản trên máy để giữ lại trước khi mở bản máy chủ.','This device has unsynced edits and the server has a newer version. Download a copy of your local edits before opening the server version.','端末に未同期の変更があり、サーバーに新しい版があります。サーバー版を開く前に端末の変更をダウンロードして保存できます。'],
    ['Tải bản chưa đồng bộ','Download unsynced edits','未同期の変更をダウンロード'],['Mở bản máy chủ (giữ bản sao trên máy)','Open server version (keep a local backup)','サーバー版を開く（端末にバックアップを保存）'],
    ['Nhạc sẽ phát sau lần tương tác đầu tiên.','Music starts after your first interaction.','最初の操作後に音楽が再生されます。'],
    ['Bổ sung họ và tên để quản trị viên dễ nhận diện tài khoản.','Add your full name so the administrator can identify your account.','管理者がアカウントを識別できるよう氏名を入力してください。'],
    ['Nhập họ và tên của bạn','Enter your full name','氏名を入力'],['Giờ địa phương, không bắt buộc.','Local time, optional.','現地時刻・任意。'],['Nhập giờ bằng bàn phím','Enter time with keyboard','キーボードで時刻を入力'],
    ['Nhập việc cần làm, chọn mục phân loại rồi bấm','Enter a task, select a category and press','タスクを入力し、カテゴリーを選んで次を押します：'],
    ['. Mở','. Open','。次を開くと：'],['nếu muốn chọn ngày và deadline.','to choose a date and deadline.','日付と締切を設定できます。'],
    ['Chọn ngày trên lịch tuần để xem và thêm task cho ngày đó. Dùng mũi tên để chuyển tuần. Bật','Select a day on the weekly calendar to view and add tasks. Use the arrows to switch weeks. Enable','週間カレンダーの日付を選んでタスクを表示・追加します。矢印で週を移動できます。次を有効にして：'],
    ['và chọn các thứ cho công việc định kỳ.','and choose weekdays for recurring tasks.','繰り返す曜日を選びます。'],
    ['Mở','Open','開く：'],['để tạo mục và chọn icon. Dùng','to create categories and choose icons. Use','でカテゴリーとアイコンを作成できます。次で絞り込み：'],
    ['hoặc tên thư mục để lọc; bấm ô vuông để hoàn thành,','or a category name to filter. Check a box to complete a task, use','またはカテゴリー名。チェックで完了し、次で編集：'],
    ['để cập nhật hoặc × để xóa task.','to update it, or × to delete it.','、×で削除します。'],
    ['Task sắp đến hạn chuyển vàng, quá hạn chuyển đỏ. Mở','Tasks due soon turn yellow; overdue tasks turn red. Open','締切間近は黄色、期限切れは赤色になります。次を開くと：'],
    ['để khôi phục và đặt deadline mới. Lịch sử tự xóa sau 10 ngày; task hoàn thành tự xóa sau 2 giờ.','to restore a task with a new deadline. History expires after 10 days; completed tasks are deleted after 2 hours.','新しい締切で復元できます。履歴は10日後、完了したタスクは2時間後に自動削除されます。'],
    ['Vào','Go to','開く：'],['Thông báo → Bật thông báo','Notifications → Enable notifications','通知 → 通知を有効にする'],
    [', cho phép trên trình duyệt rồi gửi thử. Giữ web mở để nhận nhắc; tab ngủ có thể gây trễ. Khi đóng web, nhắc nền cần backend và push notification.',', allow browser permission and send a test. Keep the page open; sleeping tabs can delay reminders. Closed-page reminders require a backend and push notifications.','。ブラウザーで許可してテスト送信してください。ページを開いたままにします。休止中のタブでは遅れる場合があります。閉じた状態での通知にはバックエンドとプッシュ通知が必要です。'],
    ['Bấm đĩa logo cạnh menu để đổi bài, chỉnh âm lượng hoặc tạm dừng. Nếu trình duyệt chặn tự phát, chạm vào trang để bắt đầu. Đổi sáng/tối ở cuối menu; bật/tắt tiếng bấm trong','Use the logo disc next to the menu to change songs, adjust volume or pause. If autoplay is blocked, tap the page. Change light/dark mode at the bottom of the menu; toggle click sounds in','メニュー横のレコードで曲・音量・一時停止を操作します。自動再生がブロックされたらページをタップしてください。メニュー下部で明暗を切り替え、クリック音は次で設定：'],
    ['Kiểm tra trạng thái','Check for','次の状態を確認：'],['trước khi đổi thiết bị hoặc đăng xuất để bảo đảm thay đổi đã lưu vào tài khoản.','before changing devices or logging out to ensure your changes are saved to your account.','。端末の変更やログアウトの前に、変更がアカウントに保存されていることを確認してください。'],
    ['Ban ngày','Daytime','昼間'],['Ban đêm','Nighttime','夜間'],['Đóng bộ chọn','Close picker','選択画面を閉じる'],['Tăng giờ','Increase hour','時を増やす'],['Giảm giờ','Decrease hour','時を減らす'],['Tăng phút','Increase minute','分を増やす'],['Giảm phút','Decrease minute','分を減らす'],
    ['Học tập','Study','勉強'],['Công việc','Work','仕事'],['Nhà cửa','Home','家'],['Thể thao','Sports','スポーツ'],['Mục tiêu','Goals','目標'],['Ý tưởng','Ideas','アイデア'],['Sáng tạo','Creative','創作'],['Lập trình','Coding','プログラミング'],['Âm nhạc','Music','音楽'],['Sức khỏe','Health','健康'],['Du lịch','Travel','旅行'],
    ['Không thể chọn ngày trong quá khứ.','You cannot choose a past date.','過去の日付は選択できません。'],['Ngày giờ deadline không hợp lệ.','Invalid deadline date or time.','締切の日時が無効です。'],['Deadline phải cùng ngày thực hiện. Hãy chọn lại giờ deadline.','The deadline must be on the task date. Choose another deadline time.','締切は実行日と同じ日付にしてください。時刻を選び直してください。'],['Nhập giờ 00–23 và phút 00–59.','Enter hours 00–23 and minutes 00–59.','時は00〜23、分は00〜59で入力してください。'],
    ['Nhập tên mục từ 1 đến 40 ký tự.','Enter a category name of 1–40 characters.','カテゴリー名は1〜40文字で入力してください。'],['Tên mục đã tồn tại. Hãy chọn tên khác.','That category already exists. Choose another name.','同じカテゴリー名が存在します。別の名前にしてください。'],['Hai mật khẩu chưa trùng nhau.','Passwords do not match.','パスワードが一致しません。'],['Kết nối quá lâu. Hãy thử lại.','The connection timed out. Try again.','接続がタイムアウトしました。再試行してください。'],['Không kết nối được máy chủ.','Cannot connect to the server.','サーバーに接続できません。'],
    ['Vui lòng nhập nội dung công việc.','Please enter a task.','タスクを入力してください。'],['Ngày thực hiện không hợp lệ.','Invalid task date.','実行日が無効です。'],['Ngày thực hiện không được ở quá khứ. Chọn hôm nay hoặc ngày sau.','The task date cannot be in the past. Choose today or a later date.','実行日は今日以降を選んでください。'],['Deadline phải sau thời gian hiện tại.','The deadline must be in the future.','締切は現在より後にしてください。'],
    ['Chọn ít nhất một thứ để lặp hằng tuần.','Choose at least one weekday to repeat.','繰り返す曜日を1つ以上選んでください。'],['Giờ deadline phải theo dạng HH:mm.','Use HH:mm for the deadline time.','締切時刻はHH:mm形式で入力してください。'],['Tối đa 100 lịch lặp cho mỗi tài khoản.','Each account supports up to 100 recurring schedules.','繰り返し予定はアカウントごとに100件までです。'],['Giờ deadline hôm nay đã qua. Chọn giờ khác hoặc ngày bắt đầu sau hôm nay.','That deadline time has passed today. Choose a later time or start date.','今日のその時刻は過ぎています。別の時刻か開始日を選んでください。'],
    ['Khôi phục task','Restore task','タスクを復元'],['Chọn ngày và deadline mới trong tương lai để khôi phục công việc.','Choose a new date and future deadline to restore this task.','新しい実行日と未来の締切を選んで復元してください。'],['Chọn deadline mới để khôi phục riêng công việc này.','Choose a new deadline to restore this task.','このタスクを復元する新しい締切を選んでください。'],['Bản ghi đã hết hạn hoặc đã được khôi phục.','This record has expired or was already restored.','この履歴は期限切れ、または復元済みです。'],['Công việc đã bị xóa ở tab khác.','This task was deleted in another tab.','このタスクは別のタブで削除されました。'],['Công việc này đã được khôi phục ở tab khác. Hãy hủy form và kiểm tra lại.','This task was restored in another tab. Cancel editing and check again.','別のタブで復元済みです。編集をキャンセルして確認してください。'],
    ['Thông báo bị chặn','Notifications blocked','通知はブロックされています'],['Bật để nhận nhắc sắp đến hạn và thông báo quá hạn.','Enable reminders for upcoming and overdue deadlines.','締切間近と期限切れの通知を有効にします。'],['Đã cấp quyền thông báo hệ thống, kể cả khi bạn ở tab/app khác. Giữ trang mở và thử nút gửi thử.','System notifications are allowed, including in other tabs or apps. Keep this page open and try a test notification.','別のタブやアプリを使用中もシステム通知を表示できます。ページを開いたままテスト送信してください。'],['Quyền đã bị chặn. Hãy cho phép thông báo trong cài đặt trang của trình duyệt.','Permission is blocked. Allow notifications in your browser site settings.','通知はブロックされています。ブラウザーのサイト設定で許可してください。'],['Thông báo không khả dụng. Hãy dùng trình duyệt hỗ trợ trên HTTPS hoặc localhost.','Notifications are unavailable. Use a supported browser on HTTPS or localhost.','通知を利用できません。HTTPSまたはlocalhostで対応ブラウザーを使用してください。'],
    ['Sẽ gửi sau 5 giây. Bây giờ hãy chuyển sang tab hoặc ứng dụng khác.','Sending in 5 seconds. Switch to another tab or app now.','5秒後に送信します。別のタブやアプリに切り替えてください。'],['Đang gửi thông báo hệ thống…','Sending system notification…','システム通知を送信中…'],['Đã gửi yêu cầu thông báo thử. Nếu không thấy banner, kiểm tra cài đặt thông báo của hệ điều hành và trình duyệt.','Test notification requested. If no banner appears, check your browser and system notification settings.','テスト通知を送信しました。バナーが出ない場合はブラウザーとOSの通知設定を確認してください。'],['Không thể bật thông báo trên trình duyệt này.','Cannot enable notifications in this browser.','このブラウザーで通知を有効にできません。'],['Không thể xin quyền thông báo. Hãy kiểm tra cài đặt trang của trình duyệt.','Cannot request notification permission. Check your browser site settings.','通知権限を要求できません。ブラウザーのサイト設定を確認してください。'],
    ['Không thể lưu cài đặt âm thanh.','Cannot save sound preferences.','サウンド設定を保存できません。'],['Không phát được âm báo. Hãy thử kích hoạt lại.','Cannot play the alert sound. Try enabling it again.','警告音を再生できません。再度有効にしてください。'],['Không bật được âm thanh trên trình duyệt này.','Cannot enable sound in this browser.','このブラウザーではサウンドを有効にできません。'],['Trình duyệt đang chặn âm thanh. Bạn có thể nhấn nút âm thanh để thử lại.','Your browser blocked sound. Use the sound button to retry.','ブラウザーがサウンドをブロックしました。サウンドボタンで再試行してください。'],['Chưa tải được lời chào. Hãy thử nút Nghe lời chào.','Could not load the greeting. Try Preview greeting.','挨拶を読み込めません。「挨拶を聴く」をお試しください。'],['Không tải được bài hát. Hãy chọn bài khác hoặc thử lại.','Could not load this song. Choose another or retry.','曲を読み込めません。別の曲を選ぶか再試行してください。'],
    ['Không đọc được lịch sử quá hạn; các task hiện tại vẫn được giữ.','Could not read overdue history; current tasks are preserved.','期限切れの履歴を読み込めません。現在のタスクは保持されています。'],['Không lưu được lịch sử quá hạn trên thiết bị này.','Cannot save overdue history on this device.','この端末に期限切れの履歴を保存できません。'],['Không đọc được lịch sử để khôi phục.','Cannot read history to restore the task.','復元する履歴を読み込めません。'],['Không đọc được lịch lặp. Các task hiện có vẫn được giữ.','Cannot read recurring schedules. Existing tasks are preserved.','繰り返し予定を読み込めません。既存のタスクは保持されています。'],['Không lưu được lịch lặp. Hãy kiểm tra bộ nhớ trình duyệt.','Cannot save recurring schedules. Check browser storage.','繰り返し予定を保存できません。ブラウザーのストレージを確認してください。'],
    ['Không thể đọc các mục đã lưu. Các công việc vẫn được giữ nguyên.','Cannot read saved categories. Your tasks are preserved.','保存済みカテゴリーを読み込めません。タスクは保持されています。'],['Không thể lưu mục mới. Kiểm tra quyền lưu trữ của trình duyệt.','Cannot save the category. Check browser storage permissions.','カテゴリーを保存できません。ブラウザーの保存権限を確認してください。'],['Không thể xóa mục vì chưa lưu được dữ liệu. Hãy thử lại.','Cannot delete the category because data could not be saved. Try again.','データを保存できないためカテゴリーを削除できません。再試行してください。'],['Không thể đọc dữ liệu đã lưu. Bạn vẫn có thể tạo danh sách mới.','Cannot read saved data. You can still create a new list.','保存データを読み込めません。新しいリストは作成できます。'],['Không thể lưu dữ liệu. Thay đổi và trạng thái nhắc chỉ được giữ trong tab này.','Cannot save data. Changes and reminder state are kept only in this tab.','データを保存できません。変更と通知状態はこのタブ内だけに保持されます。'],['Không thể đồng bộ dữ liệu từ tab khác.','Cannot sync data from another tab.','別のタブのデータを同期できません。'],['Không lưu được bản dự phòng.','Cannot save a backup.','バックアップを保存できません。'],['Đã lưu họ và tên.','Full name saved.','氏名を保存しました。']
  ];
  const dictionary=new Map(rows.map(([vi,en,ja])=>[vi,{vi,en,ja}]));
  function t(text) {
    if(language==='vi')return text;
    const exact=dictionary.get(text);if(exact)return exact[language];
    const templates=[
      [/^(\d+) công việc$/,n=>language==='en'?`${n} tasks`:`${n} 件のタスク`],
      [/^Đã hoàn thành (\d+) \/ (\d+) công việc$/,(a,b)=>language==='en'?`Completed ${a} / ${b} tasks`:`完了 ${a} / ${b} 件`],
      [/^Tự xóa sau (.+)$/,time=>language==='en'?`Auto-delete in ${time}`:`自動削除まで ${time}`],
      [/^Còn (.+) · (.+)$/,(time,date)=>language==='en'?`${time.replace(/ngày/g,'days').replace(/giờ/g,'hours').replace(/phút/g,'min')} left · ${date}`:`残り ${time.replace(/ngày/g,'日').replace(/giờ/g,'時間').replace(/phút/g,'分')} · ${date}`],
      [/^Quá hạn · Deadline: (.+)$/,date=>language==='en'?`Overdue · Deadline: ${date}`:`期限切れ · 締切: ${date}`],
      [/^Đã hoàn thành · Deadline: (.+)$/,date=>language==='en'?`Completed · Deadline: ${date}`:`完了 · 締切: ${date}`],
      [/^Hạn cũ · (.+)$/,date=>language==='en'?`Previous deadline · ${date}`:`以前の締切 · ${date}`],
      [/^Đang phát: (.+)$/,title=>language==='en'?`Playing: ${title}`:`再生中: ${title}`],
      [/^Công việc ngày (.+)$/,date=>language==='en'?`Tasks for ${date}`:`${date} のタスク`],
      [/^(\d+) công việc chưa hoàn thành: (.+)$/,(n,names)=>language==='en'?`${n} unfinished tasks: ${names}`:`未完了 ${n} 件: ${names}`],
      [/^Xóa mục “(.+)”$/,name=>language==='en'?`Delete “${name}”`:`「${name}」を削除`],
      [/^Sửa công việc: (.+)$/,name=>language==='en'?`Edit task: ${name}`:`タスクを編集: ${name}`],
      [/^Xóa công việc: (.+)$/,name=>language==='en'?`Delete task: ${name}`:`タスクを削除: ${name}`],
      [/^Lặp (\d+) ngày\/tuần$/,n=>language==='en'?`Repeat ${n} days/week`:`週${n}日繰り返す`],
      [/^Đã tạo mục “(.+)”. Bạn có thể thêm công việc vào mục này.$/,name=>language==='en'?`Created “${name}”. You can now add tasks to this category.`:`「${name}」を作成しました。このカテゴリーにタスクを追加できます。`],
      [/^Đã xóa mục “(.+)”. (\d+) task được giữ trong Chưa phân loại.$/,(name,n)=>language==='en'?`Deleted “${name}”. ${n} tasks kept in Uncategorized.`:`「${name}」を削除しました。${n}件のタスクは未分類に残ります。`]
    ];
    for(const [pattern,format] of templates){const match=text.match(pattern);if(match)return format(...match.slice(1));}
    return text;
  }
  const originalText=new WeakMap(),originalAttributes=new WeakMap();
  const ignored='script,style,noscript,textarea,[data-no-translate]:not([data-no-translate="false"]),#music-track,#account-name,.brand,.auth-brand,.footer-brand';
  // Ghi nhớ chữ gốc trên từng nút, không thay đổi HTML hoặc dữ liệu đã lưu.
  function translate(root) {
    if(root.nodeType===3){
      if(!root.parentElement || root.parentElement.closest(ignored))return;
      const old=originalText.get(root),current=root.nodeValue;
      const source=old && old.output===current?old.source:current;
      const trimmed=source.trim();if(!trimmed)return;
      const output=source.replace(trimmed,()=>t(trimmed));
      if(current!==output)root.nodeValue=output;
      originalText.set(root,{source,output});return;
    }
    if(root.nodeType!==1 || root.matches(ignored))return;
    let saved=originalAttributes.get(root);if(!saved){saved={};originalAttributes.set(root,saved);}
    for(const name of ['placeholder','aria-label','title']){
      if(!root.hasAttribute(name))continue;
      const current=root.getAttribute(name),old=saved[name];
      const source=old && old.output===current?old.source:current;
      const output=t(source);if(output!==current)root.setAttribute(name,output);
      saved[name]={source,output};
    }
    for(const child of root.childNodes)translate(child);
  }
  const observer=new MutationObserver(changes=>{
    observer.disconnect();
    for(const change of changes){
      if(change.type==='childList')for(const node of change.addedNodes)translate(node);
      else translate(change.target);
    }
    observe();
  });
  function observe(){observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});}
  function apply(){
    observer.disconnect();document.documentElement.lang=language;
    translate(document.body);translate(document.querySelector('title'));
    document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
    observe();
  }
  function setLanguage(value){
    if(!languages[value])return;
    language=value;
    try{localStorage.setItem(key,value);}catch{ /* Vẫn đổi ngôn ngữ khi storage bị chặn. */ }
    apply();window.dispatchEvent(new Event('languagechange'));
  }
  window.todoLanguage={t,get locale(){return languages[language];},set:setLanguage};
  document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.language)));
  window.addEventListener('storage',event=>{if(event.key===key || event.key===null){let saved;try{saved=localStorage.getItem(key);}catch{}language=languages[saved]?saved:'vi';apply();window.dispatchEvent(new Event('languagechange'));}});
  apply();
})();
