/* Dữ liệu HSK1 + bộ sinh đề đúng cấu trúc 40 câu (4 phần nghe + 4 phần đọc) */
(function (G) {
  'use strict';
  // Tranh (emoji) + cụm từ + câu mẫu. act = hành động (dùng hội thoại "你在做什么？")
  const PIC = [
    { zh: '看电影', py: 'kàn diànyǐng', vi: 'xem phim', e: '🎬', act: 1, s: ['我们去看电影吧。', 'Wǒmen qù kàn diànyǐng ba.', 'Chúng ta đi xem phim đi.'] },
    { zh: '打电话', py: 'dǎ diànhuà', vi: 'gọi điện thoại', e: '📞', act: 1, s: ['他在打电话。', 'Tā zài dǎ diànhuà.', 'Anh ấy đang gọi điện thoại.'] },
    { zh: '开车', py: 'kāi chē', vi: 'lái xe', e: '🚗', act: 1, s: ['我爸爸会开车。', 'Wǒ bàba huì kāi chē.', 'Bố tôi biết lái xe.'] },
    { zh: '睡觉', py: 'shuì jiào', vi: 'ngủ', e: '😴', act: 1, s: ['儿子在睡觉。', 'Érzi zài shuì jiào.', 'Con trai đang ngủ.'] },
    { g: 'book', zh: '读书', py: 'dú shū', vi: 'đọc sách', e: '📖', act: 1, s: ['她很喜欢读书。', 'Tā hěn xǐhuan dú shū.', 'Cô ấy rất thích đọc sách.'] },
    { g: 'drink', zh: '喝茶', py: 'hē chá', vi: 'uống trà', e: '🍵', act: 1, s: ['我想喝茶。', 'Wǒ xiǎng hē chá.', 'Tôi muốn uống trà.'] },
    { g: 'food', zh: '吃米饭', py: 'chī mǐfàn', vi: 'ăn cơm', e: '🍚', act: 1, s: ['中午我吃米饭。', 'Zhōngwǔ wǒ chī mǐfàn.', 'Buổi trưa tôi ăn cơm.'] },
    { g: 'food', zh: '做饭', py: 'zuò fàn', vi: 'nấu cơm', e: '🍳', act: 1, s: ['妈妈在做饭。', 'Māma zài zuò fàn.', 'Mẹ đang nấu cơm.'] },
    { zh: '写字', py: 'xiě zì', vi: 'viết chữ', e: '✍️', act: 1, s: ['我女儿会写汉字。', 'Wǒ nǚ\'ér huì xiě Hànzì.', 'Con gái tôi biết viết chữ Hán.'] },
    { g: 'shop', zh: '买东西', py: 'mǎi dōngxi', vi: 'mua đồ', e: '🛍️', act: 1, s: ['下午我去商店买东西。', 'Xiàwǔ wǒ qù shāngdiàn mǎi dōngxi.', 'Buổi chiều tôi đi cửa hàng mua đồ.'] },
    { g: 'tv', zh: '看电视', py: 'kàn diànshì', vi: 'xem tivi', e: '📺', act: 1, s: ['爸爸在看电视。', 'Bàba zài kàn diànshì.', 'Bố đang xem tivi.'] },
    { g: 'fruit', zh: '苹果', py: 'píngguǒ', vi: 'quả táo', e: '🍎', s: ['桌子上有三个苹果。', 'Zhuōzi shang yǒu sān ge píngguǒ.', 'Trên bàn có ba quả táo.'] },
    { zh: '猫', py: 'māo', vi: 'con mèo', e: '🐱', s: ['这是我的小猫。', 'Zhè shì wǒ de xiǎo māo.', 'Đây là con mèo nhỏ của tôi.'] },
    { zh: '狗', py: 'gǒu', vi: 'con chó', e: '🐶', s: ['那是谁的狗？', 'Nà shì shéi de gǒu?', 'Đó là chó của ai?'] },
    { zh: '飞机', py: 'fēijī', vi: 'máy bay', e: '✈️', s: ['我坐飞机去北京。', 'Wǒ zuò fēijī qù Běijīng.', 'Tôi đi máy bay đến Bắc Kinh.'] },
    { zh: '出租车', py: 'chūzūchē', vi: 'taxi', e: '🚕', s: ['我们坐出租车回家。', 'Wǒmen zuò chūzūchē huí jiā.', 'Chúng tôi đi taxi về nhà.'] },
    { g: 'tv', zh: '电脑', py: 'diànnǎo', vi: 'máy tính', e: '💻', s: ['这个电脑很好。', 'Zhège diànnǎo hěn hǎo.', 'Cái máy tính này rất tốt.'] },
    { g: 'med', zh: '医院', py: 'yīyuàn', vi: 'bệnh viện', e: '🏥', s: ['妈妈在医院工作。', 'Māma zài yīyuàn gōngzuò.', 'Mẹ làm việc ở bệnh viện.'] },
    { g: 'med', zh: '医生', py: 'yīshēng', vi: 'bác sĩ', e: '🩺', s: ['她是医生。', 'Tā shì yīshēng.', 'Cô ấy là bác sĩ.'] },
    { zh: '学校', py: 'xuéxiào', vi: 'trường học', e: '🏫', s: ['我在学校学习汉语。', 'Wǒ zài xuéxiào xuéxí Hànyǔ.', 'Tôi học tiếng Trung ở trường.'] },
    { g: 'shop', zh: '商店', py: 'shāngdiàn', vi: 'cửa hàng', e: '🏪', s: ['那个商店很大。', 'Nàge shāngdiàn hěn dà.', 'Cửa hàng đó rất lớn.'] },
    { zh: '火车站', py: 'huǒchēzhàn', vi: 'ga tàu', e: '🚉', s: ['明天我们在火车站见。', 'Míngtiān wǒmen zài huǒchēzhàn jiàn.', 'Ngày mai chúng ta gặp nhau ở ga tàu.'] },
    { zh: '下雨', py: 'xià yǔ', vi: 'trời mưa', e: '🌧️', s: ['今天下雨了。', 'Jīntiān xià yǔ le.', 'Hôm nay trời mưa rồi.'] },
    { zh: '很热', py: 'hěn rè', vi: 'rất nóng', e: '🥵', s: ['今天太热了。', 'Jīntiān tài rè le.', 'Hôm nay nóng quá.'] },
    { zh: '很冷', py: 'hěn lěng', vi: 'rất lạnh', e: '🥶', s: ['昨天很冷。', 'Zuótiān hěn lěng.', 'Hôm qua rất lạnh.'] },
    { zh: '衣服', py: 'yīfu', vi: 'quần áo', e: '👕', s: ['这个衣服太大了。', 'Zhège yīfu tài dà le.', 'Bộ quần áo này to quá.'] },
    { g: 'drink', zh: '杯子', py: 'bēizi', vi: 'cái cốc', e: '🥤', s: ['桌子上有一个杯子。', 'Zhuōzi shang yǒu yí ge bēizi.', 'Trên bàn có một cái cốc.'] },
    { zh: '椅子', py: 'yǐzi', vi: 'cái ghế', e: '🪑', s: ['小猫在椅子下面。', 'Xiǎo māo zài yǐzi xiàmiàn.', 'Con mèo ở dưới ghế.'] },
    { zh: '钱', py: 'qián', vi: 'tiền', e: '💰', s: ['我没有钱了。', 'Wǒ méiyǒu qián le.', 'Tôi hết tiền rồi.'] },
    { zh: '九点', py: 'jiǔ diǎn', vi: 'chín giờ', e: '🕘', s: ['现在九点了。', 'Xiànzài jiǔ diǎn le.', 'Bây giờ là chín giờ rồi.'] },
    { zh: '朋友', py: 'péngyou', vi: 'bạn bè', e: '🤝', s: ['他是我的好朋友。', 'Tā shì wǒ de hǎo péngyou.', 'Anh ấy là bạn tốt của tôi.'] },
    { zh: '高兴', py: 'gāoxìng', vi: 'vui', e: '😄', s: ['认识你很高兴。', 'Rènshi nǐ hěn gāoxìng.', 'Rất vui được quen bạn.'] },
    { g: 'food', zh: '饭馆', py: 'fànguǎn', vi: 'quán ăn', e: '🍜', s: ['我们去饭馆吃饭吧。', 'Wǒmen qù fànguǎn chī fàn ba.', 'Chúng ta đi quán ăn ăn cơm đi.'] },
    { g: 'fruit', zh: '水果', py: 'shuǐguǒ', vi: 'hoa quả', e: '🍇', s: ['我想买一些水果。', 'Wǒ xiǎng mǎi yìxiē shuǐguǒ.', 'Tôi muốn mua ít hoa quả.'] },
    { g: 'book', zh: '书', py: 'shū', vi: 'quyển sách', e: '📚', s: ['这是我的书。', 'Zhè shì wǒ de shū.', 'Đây là sách của tôi.'] },
    { zh: '工作', py: 'gōngzuò', vi: 'làm việc', e: '💼', act: 1, s: ['我爸爸在工作。', 'Wǒ bàba zài gōngzuò.', 'Bố tôi đang làm việc.'] },
  ];

  // Phần 4 nghe: mẫu câu có chỗ trống
  const P = [['王先生', 'Wáng xiānsheng', 'Ông Vương'], ['李小姐', 'Lǐ xiǎojiě', 'Cô Lý'], ['张老师', 'Zhāng lǎoshī', 'Thầy Trương'], ['他妈妈', 'tā māma', 'mẹ anh ấy']];
  const T = [['明天上午', 'míngtiān shàngwǔ', 'sáng mai'], ['明天下午', 'míngtiān xiàwǔ', 'chiều mai'], ['星期六', 'xīngqīliù', 'thứ bảy'], ['下午三点', 'xiàwǔ sān diǎn', '3 giờ chiều'], ['中午', 'zhōngwǔ', 'buổi trưa'], ['下个月', 'xià ge yuè', 'tháng sau']];
  const L = [['北京', 'Běijīng', 'Bắc Kinh'], ['商店', 'shāngdiàn', 'cửa hàng'], ['医院', 'yīyuàn', 'bệnh viện'], ['学校', 'xuéxiào', 'trường học'], ['火车站', 'huǒchēzhàn', 'ga tàu'], ['饭馆', 'fànguǎn', 'quán ăn'], ['朋友家', 'péngyou jiā', 'nhà bạn']];
  const NUM = [['五', 'wǔ', 5], ['八', 'bā', 8], ['十', 'shí', 10], ['十五', 'shíwǔ', 15], ['二十', 'èrshí', 20], ['三十', 'sānshí', 30], ['四十', 'sìshí', 40], ['六', 'liù', 6], ['七', 'qī', 7], ['九', 'jiǔ', 9]];
  const L4 = [
    () => { const p = pick(P), t3 = sample(T, 3), l = pick(L); return { a: [p[0] + t3[0][0] + '去' + l[0] + '。', p[1] + ' ' + t3[0][1] + ' qù ' + l[1] + '.', cap(p[2]) + ' ' + t3[0][2] + ' đi ' + l[2] + '.'], q: [p[0] + '什么时候去' + l[0] + '？', p[1] + ' shénme shíhou qù ' + l[1] + '?', cap(p[2]) + ' khi nào đi ' + l[2] + '?'], opts: t3.map(x => [x[0], x[1], x[2]]) }; },
    () => { const p = pick(P), t = pick(T), l3 = sample(L, 3); return { a: [p[0] + t[0] + '去' + l3[0][0] + '。', p[1] + ' ' + t[1] + ' qù ' + l3[0][1] + '.', cap(p[2]) + ' ' + t[2] + ' đi ' + l3[0][2] + '.'], q: [p[0] + t[0] + '去哪儿？', p[1] + ' ' + t[1] + ' qù nǎr?', cap(p[2]) + ' ' + t[2] + ' đi đâu?'], opts: l3.map(x => [x[0], x[1], x[2]]) }; },
    () => { const n3 = sample(NUM.filter(x => x[2] >= 10), 3); return { a: ['这本书' + n3[0][0] + '块钱。', 'Zhè běn shū ' + n3[0][1] + ' kuài qián.', 'Quyển sách này ' + n3[0][2] + ' đồng.'], q: ['这本书多少钱？', 'Zhè běn shū duōshao qián?', 'Quyển sách này bao nhiêu tiền?'], opts: n3.map(x => [x[0] + '块', x[1] + ' kuài', x[2] + ' đồng']) }; },
    () => { const n3 = sample(NUM.filter(x => x[2] <= 10), 3); return { a: ['我儿子今年' + n3[0][0] + '岁了。', 'Wǒ érzi jīnnián ' + n3[0][1] + ' suì le.', 'Con trai tôi năm nay ' + n3[0][2] + ' tuổi.'], q: ['他儿子多大了？', 'Tā érzi duō dà le?', 'Con trai anh ấy bao nhiêu tuổi?'], opts: n3.map(x => [x[0] + '岁', x[1] + ' suì', x[2] + ' tuổi']) }; },
    () => { const n3 = sample([['三', 'sān', 3], ['四', 'sì', 4], ['五', 'wǔ', 5], ['六', 'liù', 6]], 3); return { a: ['我家有' + n3[0][0] + '口人。', 'Wǒ jiā yǒu ' + n3[0][1] + ' kǒu rén.', 'Nhà tôi có ' + n3[0][2] + ' người.'], q: ['他家有几口人？', 'Tā jiā yǒu jǐ kǒu rén?', 'Nhà anh ấy có mấy người?'], opts: n3.map(x => [x[0] + '口', x[1] + ' kǒu', x[2] + ' người']) }; },
    () => { const w3 = sample([['很热', 'hěn rè', 'rất nóng'], ['很冷', 'hěn lěng', 'rất lạnh'], ['下雨', 'xià yǔ', 'trời mưa']], 3); const d = pick([['今天', 'jīntiān', 'Hôm nay'], ['昨天', 'zuótiān', 'Hôm qua']]); return { a: [d[0] + '北京' + (w3[0][0] === '下雨' ? '下雨了' : '天气' + w3[0][0]) + '。', d[1] + ' Běijīng ' + (w3[0][0] === '下雨' ? 'xià yǔ le' : 'tiānqì ' + w3[0][1]) + '.', d[2] + ' Bắc Kinh ' + w3[0][2] + '.'], q: [d[0] + '北京天气怎么样？', d[1] + ' Běijīng tiānqì zěnmeyàng?', d[2] + ' thời tiết Bắc Kinh thế nào?'], opts: w3 }; },
    () => { const x3 = sample([['茶', 'chá', 'trà'], ['水', 'shuǐ', 'nước'], ['米饭', 'mǐfàn', 'cơm'], ['苹果', 'píngguǒ', 'táo']], 3); const v = ['茶', '水'].includes(x3[0][0]) ? ['喝', 'hē', 'uống'] : ['吃', 'chī', 'ăn']; return { a: ['我想' + v[0] + x3[0][0] + '。', 'Wǒ xiǎng ' + v[1] + ' ' + x3[0][1] + '.', 'Tôi muốn ' + v[2] + ' ' + x3[0][2] + '.'], q: ['他想' + v[0] + '什么？', 'Tā xiǎng ' + v[1] + ' shénme?', 'Anh ấy muốn ' + v[2] + ' gì?'], opts: x3 }; },
  ];

  // Phần 3 đọc: câu hỏi – câu trả lời (c = nhóm để tránh trùng nghĩa)
  const QA = [
    { c: 'name', q: ['你叫什么名字？', 'Nǐ jiào shénme míngzi?', 'Bạn tên là gì?'], a: ['我叫李月。', 'Wǒ jiào Lǐ Yuè.', 'Tôi tên là Lý Nguyệt.'] },
    { c: 'nation', q: ['你是哪国人？', 'Nǐ shì nǎ guó rén?', 'Bạn là người nước nào?'], a: ['我是中国人。', 'Wǒ shì Zhōngguó rén.', 'Tôi là người Trung Quốc.'] },
    { c: 'count', q: ['你家有几口人？', 'Nǐ jiā yǒu jǐ kǒu rén?', 'Nhà bạn có mấy người?'], a: ['四口人。', 'Sì kǒu rén.', 'Bốn người.'] },
    { c: 'age', q: ['你今年多大了？', 'Nǐ jīnnián duō dà le?', 'Năm nay bạn bao nhiêu tuổi?'], a: ['我二十岁。', 'Wǒ èrshí suì.', 'Tôi hai mươi tuổi.'] },
    { c: 'can', q: ['你会说汉语吗？', 'Nǐ huì shuō Hànyǔ ma?', 'Bạn biết nói tiếng Trung không?'], a: ['会说一点儿。', 'Huì shuō yìdiǎnr.', 'Biết nói một chút.'] },
    { c: 'time', q: ['现在几点？', 'Xiànzài jǐ diǎn?', 'Bây giờ mấy giờ?'], a: ['十点十分。', 'Shí diǎn shí fēn.', 'Mười giờ mười phút.'] },
    { c: 'where', q: ['你在哪儿工作？', 'Nǐ zài nǎr gōngzuò?', 'Bạn làm việc ở đâu?'], a: ['在医院。', 'Zài yīyuàn.', 'Ở bệnh viện.'] },
    { c: 'drink', q: ['你想喝什么？', 'Nǐ xiǎng hē shénme?', 'Bạn muốn uống gì?'], a: ['我想喝茶。', 'Wǒ xiǎng hē chá.', 'Tôi muốn uống trà.'] },
    { c: 'weather', q: ['今天天气怎么样？', 'Jīntiān tiānqì zěnmeyàng?', 'Hôm nay thời tiết thế nào?'], a: ['太热了。', 'Tài rè le.', 'Nóng quá.'] },
    { c: 'price', q: ['这个杯子多少钱？', 'Zhège bēizi duōshao qián?', 'Cái cốc này bao nhiêu tiền?'], a: ['八块。', 'Bā kuài.', 'Tám đồng.'] },
    { c: 'when', q: ['你什么时候回来？', 'Nǐ shénme shíhou huílai?', 'Khi nào bạn về?'], a: ['明天下午。', 'Míngtiān xiàwǔ.', 'Chiều mai.'] },
    { c: 'thanks', q: ['谢谢你！', 'Xièxie nǐ!', 'Cảm ơn bạn!'], a: ['不客气。', 'Bú kèqi.', 'Không có gì.'] },
    { c: 'sorry', q: ['对不起！', 'Duìbuqǐ!', 'Xin lỗi!'], a: ['没关系。', 'Méi guānxi.', 'Không sao.'] },
    { c: 'like', q: ['你喜欢看电影吗？', 'Nǐ xǐhuan kàn diànyǐng ma?', 'Bạn thích xem phim không?'], a: ['很喜欢。', 'Hěn xǐhuan.', 'Rất thích.'] },
    { c: 'live', q: ['你住在哪儿？', 'Nǐ zhù zài nǎr?', 'Bạn sống ở đâu?'], a: ['我住在北京。', 'Wǒ zhù zài Běijīng.', 'Tôi sống ở Bắc Kinh.'] },
    { c: 'loc', q: ['我的电脑呢？', 'Wǒ de diànnǎo ne?', 'Máy tính của tôi đâu?'], a: ['在桌子上。', 'Zài zhuōzi shang.', 'Ở trên bàn.'] },
    { c: 'know', q: ['你认识王先生吗？', 'Nǐ rènshi Wáng xiānsheng ma?', 'Bạn có quen ông Vương không?'], a: ['认识，他是我朋友。', 'Rènshi, tā shì wǒ péngyou.', 'Quen, ông ấy là bạn tôi.'] },
    { c: 'past', q: ['你昨天去哪儿了？', 'Nǐ zuótiān qù nǎr le?', 'Hôm qua bạn đã đi đâu?'], a: ['我去商店了。', 'Wǒ qù shāngdiàn le.', 'Tôi đi cửa hàng.'] },
    { c: 'how', q: ['你怎么去学校？', 'Nǐ zěnme qù xuéxiào?', 'Bạn đến trường bằng gì?'], a: ['坐出租车去。', 'Zuò chūzūchē qù.', 'Đi taxi.'] },
    { c: 'what', q: ['桌子上有什么？', 'Zhuōzi shang yǒu shénme?', 'Trên bàn có gì?'], a: ['有一本书。', 'Yǒu yì běn shū.', 'Có một quyển sách.'] },
    { c: 'who', q: ['那个人是谁？', 'Nàge rén shì shéi?', 'Người kia là ai?'], a: ['是我的老师。', 'Shì wǒ de lǎoshī.', 'Là thầy giáo của tôi.'] },
  ];

  // Phần 4 đọc: điền từ (g = nhóm dễ thay thế nhau, không chọn 2 từ cùng nhóm)
  const FILL = [
    { w: ['医院', 'yīyuàn', 'bệnh viện'], g: 'place', s: ['我妈妈是医生，她在（　）工作。', 'Wǒ māma shì yīshēng, tā zài ( ) gōngzuò.', 'Mẹ tôi là bác sĩ, bà ấy làm việc ở bệnh viện.'] },
    { w: ['喝', 'hē', 'uống'], g: 'drink', s: ['你想（　）茶吗？', 'Nǐ xiǎng ( ) chá ma?', 'Bạn muốn uống trà không?'] },
    { w: ['几', 'jǐ', 'mấy'], g: 'q1', s: ['现在（　）点了？', 'Xiànzài ( ) diǎn le?', 'Bây giờ mấy giờ rồi?'] },
    { w: ['名字', 'míngzi', 'tên'], g: 'name', s: ['你叫什么（　）？', 'Nǐ jiào shénme ( )?', 'Bạn tên là gì?'] },
    { w: ['米饭', 'mǐfàn', 'cơm'], g: 'food', s: ['中午我想吃（　）。', 'Zhōngwǔ wǒ xiǎng chī ( ).', 'Buổi trưa tôi muốn ăn cơm.'] },
    { w: ['岁', 'suì', 'tuổi'], g: 'mw', s: ['我女儿今年五（　）了。', 'Wǒ nǚ\'ér jīnnián wǔ ( ) le.', 'Con gái tôi năm nay năm tuổi.'] },
    { w: ['块', 'kuài', 'đồng'], g: 'mw', s: ['这本书二十（　）钱。', 'Zhè běn shū èrshí ( ) qián.', 'Quyển sách này hai mươi đồng.'] },
    { w: ['会', 'huì', 'biết (làm)'], g: 'verb', s: ['你（　）开车吗？', 'Nǐ ( ) kāi chē ma?', 'Bạn biết lái xe không?'] },
    { w: ['怎么样', 'zěnmeyàng', 'thế nào'], g: 'q2', s: ['今天天气（　）？', 'Jīntiān tiānqì ( )?', 'Hôm nay thời tiết thế nào?'] },
    { w: ['认识', 'rènshi', 'quen biết'], g: 'verb', s: ['我不（　）那个人。', 'Wǒ bú ( ) nàge rén.', 'Tôi không quen người đó.'] },
    { w: ['飞机', 'fēijī', 'máy bay'], g: 'vehicle', s: ['我坐（　）去北京。', 'Wǒ zuò ( ) qù Běijīng.', 'Tôi đi máy bay đến Bắc Kinh.'] },
    { w: ['哪儿', 'nǎr', 'đâu'], g: 'q3', s: ['你住在（　）？', 'Nǐ zhù zài ( )?', 'Bạn sống ở đâu?'] },
    { w: ['喜欢', 'xǐhuan', 'thích'], g: 'verb', s: ['我很（　）看电影。', 'Wǒ hěn ( ) kàn diànyǐng.', 'Tôi rất thích xem phim.'] },
    { w: ['没', 'méi', 'không (có)'], g: 'neg', s: ['我（　）有钱了。', 'Wǒ ( ) yǒu qián le.', 'Tôi hết tiền rồi.'] },
    { w: ['个', 'gè', 'cái (lượng từ)'], g: 'mw', s: ['桌子上有三（　）杯子。', 'Zhuōzi shang yǒu sān ( ) bēizi.', 'Trên bàn có ba cái cốc.'] },
    { w: ['下雨', 'xià yǔ', 'trời mưa'], g: 'weather', s: ['今天（　）了，我们不去商店了。', 'Jīntiān ( ) le, wǒmen bú qù shāngdiàn le.', 'Hôm nay trời mưa, chúng ta không đi cửa hàng nữa.'] },
    { w: ['女儿', 'nǚ\'ér', 'con gái'], g: 'family', s: ['这是我（　），她七岁了。', 'Zhè shì wǒ ( ), tā qī suì le.', 'Đây là con gái tôi, cháu bảy tuổi rồi.'] },
  ];

  // ---------- tiện ích ngẫu nhiên ----------
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function sample(a, n) { return shuffle(a).slice(0, n); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  const AF = 'ABCDEF';
  const grp = (p) => p.g || p.zh;
  // chọn n tranh không trùng nhóm nghĩa (tránh 2 tranh dễ nhầm)
  function distinct(n, avoid = []) { const out = [], gs = new Set(avoid.map(grp)); for (const p of shuffle(PIC)) { if (gs.has(grp(p))) continue; out.push(p); gs.add(grp(p)); if (out.length === n) break; } return out; }

  // ---------- sinh đề ----------
  function generate() {
    const Q = [];
    // Nghe 1 (1–5): tranh + nghe cụm từ → đúng/sai
    sample(PIC, 5).forEach(p => {
      const ok = Math.random() < 0.5, said = ok ? p : distinct(1, [p])[0];
      Q.push({ part: 'L1', type: 'tf', pic: p.e, audio: [said.zh, said.zh], ans: ok ? 'Y' : 'N',
        exp: `Nghe: ${said.zh} (${said.py}) – ${said.vi}. Tranh: ${p.vi}.` });
    });
    // Nghe 2 (6–10): nghe câu → chọn tranh A/B/C
    sample(PIC, 5).forEach(p => {
      const opts = shuffle([p, ...distinct(2, [p])]);
      Q.push({ part: 'L2', type: 'abc', pics: opts.map(o => o.e), audio: [p.s[0], p.s[0]], ans: AF[opts.indexOf(p)],
        exp: `${p.s[0]} (${p.s[1]}) – ${p.s[2]}` });
    });
    // Nghe 3 (11–15): hội thoại → nối với tranh A–F
    const six = distinct(6), five = sample(six, 5);
    five.forEach(p => {
      const d = p.act ? [['女', '你在做什么？', 'Nǐ zài zuò shénme?', 'Bạn đang làm gì?'], ['男', '我在' + p.zh + '。', 'Wǒ zài ' + p.py + '.', 'Tôi đang ' + p.vi + '.']]
        : [['男', p.s[0], p.s[1], p.s[2]], ['女', '是吗？', 'Shì ma?', 'Thế à?']];
      Q.push({ part: 'L3', type: 'af', group: six.map(o => o.e), audio: d.map(x => ({ who: x[0], t: x[1] })), ans: AF[six.indexOf(p)],
        exp: d.map(x => `${x[0]}: ${x[1]} (${x[2]}) – ${x[3]}`).join(' / ') });
    });
    // Nghe 4 (16–20): câu + câu hỏi → chọn A/B/C (chữ)
    sample(L4, 5).forEach(f => {
      const g = f(), opts = shuffle(g.opts), right = g.opts[0];
      Q.push({ part: 'L4', type: 'abct', opts, audio: [{ who: '女', t: g.a[0] }, { who: '男', t: '问：' + g.q[0] }], ans: AF[opts.indexOf(right)],
        exp: `${g.a[0]} (${g.a[1]}) – ${g.a[2]} Hỏi: ${g.q[0]} (${g.q[1]}) – ${g.q[2]}` });
    });
    // Đọc 1 (21–25): tranh + từ → đúng/sai
    sample(PIC, 5).forEach(p => {
      const ok = Math.random() < 0.5, w = ok ? p : distinct(1, [p])[0];
      Q.push({ part: 'R1', type: 'tf', pic: p.e, word: [w.zh, w.py], ans: ok ? 'Y' : 'N', exp: `${w.zh} (${w.py}) = ${w.vi}. Tranh: ${p.vi}.` });
    });
    // Đọc 2 (26–30): câu → nối với tranh A–F
    const six2 = distinct(6), five2 = sample(six2, 5);
    five2.forEach(p => Q.push({ part: 'R2', type: 'af', group: six2.map(o => o.e), text: [p.s[0], p.s[1]], ans: AF[six2.indexOf(p)], exp: `${p.s[0]} – ${p.s[2]}` }));
    // Đọc 3 (31–35): câu hỏi → câu trả lời A–F
    const qa = []; for (const x of shuffle(QA)) if (!qa.some(y => y.c === x.c)) { qa.push(x); if (qa.length === 6) break; }
    const ansList = shuffle(qa); // 6 câu trả lời (1 câu thừa)
    qa.slice(0, 5).forEach(x => Q.push({ part: 'R3', type: 'af', group: ansList.map(y => y.a), text: [x.q[0], x.q[1]], ans: AF[ansList.indexOf(x)], exp: `${x.q[0]} – ${x.q[2]} → ${x.a[0]} (${x.a[1]}) – ${x.a[2]}` }));
    // Đọc 4 (36–40): điền từ A–F
    const fl = []; for (const x of shuffle(FILL)) if (!fl.some(y => y.g === x.g)) { fl.push(x); if (fl.length === 6) break; }
    const bank = shuffle(fl);
    fl.slice(0, 5).forEach(x => Q.push({ part: 'R4', type: 'af', group: bank.map(y => [y.w[0], y.w[1]]), text: [x.s[0], x.s[1]], ans: AF[bank.indexOf(x)], exp: `${x.s[0].replace('（　）', '（' + x.w[0] + '）')} – ${x.s[2]}  (${x.w[0]} ${x.w[1]}: ${x.w[2]})` }));
    Q.forEach((q, i) => q.n = i + 1);
    return { id: 'gen-' + Date.now(), name: 'Đề tự sinh ' + new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }), generated: true, questions: Q, key: Q.map(q => q.ans) };
  }

  const PARTS = {
    L1: { t: 'Nghe – Phần 1 (câu 1–5)', d: 'Nghe cụm từ, xem tranh có đúng không (√ / ×). Mỗi câu nghe 2 lần.' },
    L2: { t: 'Nghe – Phần 2 (câu 6–10)', d: 'Nghe câu, chọn tranh đúng A, B hoặc C.' },
    L3: { t: 'Nghe – Phần 3 (câu 11–15)', d: 'Nghe hội thoại, chọn tranh phù hợp (A–F).' },
    L4: { t: 'Nghe – Phần 4 (câu 16–20)', d: 'Nghe câu và câu hỏi, chọn đáp án đúng.' },
    R1: { t: 'Đọc – Phần 1 (câu 21–25)', d: 'Xem tranh và từ, đúng (√) hay sai (×).' },
    R2: { t: 'Đọc – Phần 2 (câu 26–30)', d: 'Chọn tranh phù hợp với câu (A–F).' },
    R3: { t: 'Đọc – Phần 3 (câu 31–35)', d: 'Chọn câu trả lời phù hợp (A–F).' },
    R4: { t: 'Đọc – Phần 4 (câu 36–40)', d: 'Chọn từ thích hợp điền vào chỗ trống (A–F).' },
  };

  G.HSK1 = { generate, PARTS, PIC };
})(window);
