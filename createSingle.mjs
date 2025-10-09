import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';

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

    console.log("새로운 차트 트랙를 가져오는 중...");

    const trackId = Number(process.argv.slice(2)[0]);

    const HistoryQueue = await historyQueue.findOne({ trackId });
    const trashList = await pendingQueues.findOne({ trackId });

    if (HistoryQueue || trashList) {
        console.log(`${trackId} 이미 ${HistoryQueue ? 'HistoryQueue' : 'PendingQueues'}에 존재합니다.`);
        process.exit(1);
    }

    const trackInfo = await getTrackInfo(trackId);
    const lyrics = await getSinklyrics(trackId);

    if (!lyrics) {
        console.log(`${trackId}의 가사를 찾을 수 없습니다.`);
        process.exit(1);
    }

    const addData = new pendingQueues({
        identifier: `${trackInfo.artist} - ${trackInfo.track} [${trackInfo.album}]`,
        trackId: trackId,
    });

    await addData.save();
    console.log(`${trackId} ${trackInfo.track} 데이터베이스에 추가됨.`);


    console.log("데이터 업데이트 완료.");
})();

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