/* eslint-disable class-methods-use-this */
import { log } from 'Common/logger';
import { settings } from './settings';
import { SETTINGS_NAMES } from 'Common/constants/settings-constants';

export class ClipImageClassifier {
    IMAGE_SIZE = 224;

    static async imageSrcToFile(
        src: string,
        fileName = 'image',
    ): Promise<File | null> {
        try {
            const response = await fetch(src);
            if (!response.ok) {
                log.error(`HTTP error! Status: ${response.status}`);
                return null;
            }

            const blob = await response.blob();
            const file = new File([blob], `${fileName}.jpg`, {
                type: 'image/jpeg',
            });
            return file;
        } catch (error) {
            log.error('Error fetching image:', error);
            return null;
        }
    }

    static async isServerAccessible(url: string) {
        try {
            await fetch(url, { method: 'HEAD' });
            return true;
        } catch (error) {
            return false;
        }
    }

    public static async isAvailable() {
        const response = await ClipImageClassifier.isServerAccessible(settings.getSetting(SETTINGS_NAMES.CLIP_PROTECTION_SERVER))
        return response;
    }

    public static async analyzeImage(src: string): Promise<number | null> {
        const imageFile = await ClipImageClassifier.imageSrcToFile(src);

        if (!imageFile) {
            return null;
        }

        const formData = new FormData();
        formData.append('file', imageFile);

        const options = { method: 'POST', body: formData };

        const response = await fetch(
            settings.getSetting(SETTINGS_NAMES.CLIP_PROTECTION_SERVER) + "/predict",
            options,
        );
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const prediction = await response.json();
        return prediction;
    }
}