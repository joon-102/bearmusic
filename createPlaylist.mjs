import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import { load } from 'cheerio'

dotenv.config();

const historyQueue = mongoose.model("historyQueue", new mongoose.Schema(
    {
        identifier: { type: String, required: true },
        trackId: { type: String, required: true },
    }
));

const pendingQueues = mongoose.model("pendingqueues", new mongoose.Schema(
    {
        identifier: { type: String, required: true },
        trackId: { type: String, required: true },
    }
));

(async () => {
    await mongoose.connect(process.env.MONGO_URI);

    if (!process.argv.slice(2)[0]) {
        console.log("인자를 입력해 주세요.");
        process.exit(1);
    }

    console.log("새로운 차트 데이터를 가져오는 중...");

    const results = await getChart(process.argv.slice(2)[0])
    let newQueue = results.flat();

    console.log(`총 ${newQueue.length}개의 트랙을 가져왔습니다.`);

    newQueue = newQueue.filter(
        (item, index, self) =>
            index === self.findIndex(t => t.trackId === item.trackId)
    );

    for (const item of newQueue) {
        const trackId = Number(item.trackId);

        const HistoryQueue = await historyQueue.findOne({ trackId });
        const trashList = await pendingQueues.findOne({ trackId });

        if (HistoryQueue || trashList) {
            console.log(`${trackId} 이미 ${HistoryQueue ? 'HistoryQueue' : 'PendingQueues'}에 존재합니다.`);
            continue;
        }

        const trackInfo = await getTrackInfo(trackId);
        const lyrics = await getSinklyrics(trackId);

        if (!lyrics) {
            console.log(`${trackId}의 가사를 찾을 수 없습니다.`);
            continue;
        }

        const addData = new pendingQueues({
            identifier: `${trackInfo.artist} - ${trackInfo.track} [${trackInfo.album}]`,
            trackId: item.trackId,
        });

        await addData.save();
        console.log(`${trackId} ${trackInfo.track} 데이터베이스에 추가됨.`);
    }

    console.log("데이터 업데이트 완료.");
})();

const getChart = async (args) => {
    const trackRes = await axios.get(args);
    const $ = load(trackRes.data);

    let match;
    match = /ESALBUM([A-Za-z0-9]+)/g.exec(trackRes.data)

    const tracks = [];

    $(`#ESALBUM${match[1]} > table > tbody > tr`).each((_, el) => {
        const $el = $(el);

        const title = $el.find('.title a').text().trim();
        const artist = $el.find('.artist a').text().trim();
        if (!title || !artist) return;

        const trackHref = $el.find('.trackInfo').attr('href') ?? '';
        const artistHref = $el.find('.artist a').attr('href') ?? '';
        const albumHref = $el.find('td:nth-child(9) > a').attr('href') ?? '';
        const imgSrcRaw = $el.find('.thumbnail img').attr('src') ?? '';

        const trackId = trackHref.split('/track/')[1]?.split('?')[0];
        const artistId = artistHref.split('/artist/')[1]?.split('?')[0];
        const albumId = albumHref.split('/album/')[1]?.split('?')[0];
        const imgSrc = imgSrcRaw.replace('50', 'original').split('?')[0];

        tracks.push({ title, artist, trackId, artistId, imgSrc, albumId });
    });

    return tracks.slice(0, 100);
};


const getSinklyrics = async (trackId) => {
    const response = await axios.get(`https://music.bugs.co.kr/player/lyrics/T/${trackId}`);
    if (!response.data.lyrics) return null;

    return response.data.lyrics.split('＃').map(item => {
        const [time, lyrics] = item.split('|');
        return { time: parseFloat(time), lyrics };
    });
};

const getTrackInfo = async (trackId) => {
    const response = await axios.get(`https://music.bugs.co.kr/player/track/${trackId}`);
    return {
        track: response.data.track.track_title,
        artist: response.data.track.artist_disp_nm,
        album: response.data.track.album_title,
        release: response.data.track.release_ymd
    };
};