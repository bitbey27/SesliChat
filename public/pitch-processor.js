/**
 * SesliChat — AudioWorklet Pitch Shifter (Granular Synthesis)
 *
 * Bu dosya AudioWorklet processor olarak register edilir.
 * AudioWorklet audio thread'inde çalışır — main thread'i bloklamaz.
 *
 * Algoritma: Granular Synthesis (Overlap-Add)
 * - Input samples circular buffer'a yazılır
 * - İki grain okuyucu (grain1 ve grain2) yarım grain offset ile
 * - Hann window crossfade → click artifacts yok
 * - readIdx pitch oranında ilerler:
 *   * pitch > 1: daha hızlı oku → output pitch yükselir
 *   * pitch < 1: daha yavaş oku → output pitch düşer
 *   * pitch = 1: passthrough (input = output, sadece bir miktar gecikme)
 * - Grain bittiğinde readIdx writeIdx'in gerisine sıfırlanır (grain restart)
 *
 * Test: pitch=1 → output input'un biraz gecikmiş hali (passthrough)
 *       pitch=2 → bir oktav yukarı
 *       pitch=0.5 → bir oktav aşağı
 */

const BUFFER_SIZE = 16384;     // Circular buffer boyutu (~370ms @ 44.1kHz)
const GRAIN_SIZE = 2048;       // Grain boyutu (~46ms — sesin doğal periyodu için iyi)
const HALF_GRAIN = GRAIN_SIZE / 2;

class PitchProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{
            name: 'pitch',
            defaultValue: 1,
            minValue: 0.25,
            maxValue: 4,
            automationRate: 'k-rate'
        }];
    }

    constructor() {
        super();
        // Stereo için 2 ayrı circular buffer
        this.buffers = [
            new Float32Array(BUFFER_SIZE),
            new Float32Array(BUFFER_SIZE)
        ];
        this.writeIdx = 0;

        // İki grain reader — yarım grain offset
        this.readIdx1 = 0;
        this.readIdx2 = 0;
        this.grainPos1 = 0;
        this.grainPos2 = HALF_GRAIN;  // offset

        // Hann window — grain baş/sonunda amplitude 0'a iner (smooth fade)
        this.hann = new Float32Array(GRAIN_SIZE);
        for (let i = 0; i < GRAIN_SIZE; i++) {
            this.hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / GRAIN_SIZE);
        }

        // Son process çağrısında input var mıydı?
        this.hasInput = false;
    }

    /**
     * Linear interpolation ile circular buffer'dan oku
     */
    readSample(buffer, readIdx) {
        const intPos = Math.floor(readIdx);
        const frac = readIdx - intPos;
        const idx1 = ((intPos % BUFFER_SIZE) + BUFFER_SIZE) % BUFFER_SIZE;
        const idx2 = (idx1 + 1) % BUFFER_SIZE;
        return buffer[idx1] * (1 - frac) + buffer[idx2] * frac;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        // Input yoksa sessizlik output (ama processor yaşamaya devam et)
        if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
            for (let ch = 0; ch < output.length; ch++) {
                if (output[ch]) output[ch].fill(0);
            }
            return true;
        }

        const pitch = parameters.pitch[0];
        const numFrames = output[0].length;
        const numChannels = Math.min(input.length, output.length, 2);  // max 2 kanal

        for (let i = 0; i < numFrames; i++) {
            // 1. Input samples'ı circular buffer'a yaz
            for (let ch = 0; ch < numChannels; ch++) {
                if (input[ch]) {
                    this.buffers[ch][this.writeIdx] = input[ch][i];
                }
            }
            this.writeIdx = (this.writeIdx + 1) % BUFFER_SIZE;

            // 2. Hann window değerleri (grain1 ve grain2 için)
            const g1 = Math.floor(this.grainPos1);
            const g2 = Math.floor(this.grainPos2);
            const window1 = this.hann[g1];
            const window2 = this.hann[g2];

            // 3. Her channel için sample oku ve mix'le
            for (let ch = 0; ch < numChannels; ch++) {
                const buf = this.buffers[ch];
                // Grain 1 okuma
                const sample1 = this.readSample(buf, this.readIdx1);
                // Grain 2 okuma (yarım grain offset)
                const sample2 = this.readSample(buf, this.readIdx2);
                // Mix — Hann window'lar yarım grain offset ile toplamı 1 yapar
                output[ch][i] = sample1 * window1 + sample2 * window2;
            }

            // Eğer output 1 kanal ama input 2 kanal: ikinci kanalı output'a kopyala (mono'dan)
            if (numChannels === 1 && output.length > 1 && output[1]) {
                output[1][i] = output[0][i];
            }

            // 4. Pozisyonları ilerlet
            // pitch > 1: readIdx daha hızlı ilerler → input daha hızlı okunur → output pitch yükselir
            // pitch < 1: readIdx daha yavaş ilerler → input daha yavaş okunur → output pitch düşer
            this.readIdx1 += pitch;
            this.readIdx2 += pitch;
            this.grainPos1 += 1;
            this.grainPos2 += 1;

            // 5. Wrap readIdx'ler
            while (this.readIdx1 >= BUFFER_SIZE) this.readIdx1 -= BUFFER_SIZE;
            while (this.readIdx1 < 0) this.readIdx1 += BUFFER_SIZE;
            while (this.readIdx2 >= BUFFER_SIZE) this.readIdx2 -= BUFFER_SIZE;
            while (this.readIdx2 < 0) this.readIdx2 += BUFFER_SIZE;

            // 6. Grain restart — writeIdx'in gerisine sıfırla
            //    Bu grain içindeki son "lookback" noktasıdır
            if (this.grainPos1 >= GRAIN_SIZE) {
                this.grainPos1 = 0;
                this.readIdx1 = (this.writeIdx - HALF_GRAIN + BUFFER_SIZE) % BUFFER_SIZE;
            }
            if (this.grainPos2 >= GRAIN_SIZE) {
                this.grainPos2 = 0;
                this.readIdx2 = (this.writeIdx - HALF_GRAIN + BUFFER_SIZE) % BUFFER_SIZE;
            }
        }

        return true;
    }
}

registerProcessor('pitch-processor', PitchProcessor);
