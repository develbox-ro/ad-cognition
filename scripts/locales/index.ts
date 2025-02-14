import { program } from 'commander';

import { cliLog } from '../cli-log';

import { downloadAndSave } from './download-locales';
import { uploadLocales } from './upload-locales';
import { renewLocales } from './renew-locales';
import { checkTranslations } from './validate';
import { checkUnusedMessages } from './unused';
import { LANGUAGES, REQUIRED_LOCALES } from './locales-constants';

const LOCALES = Object.keys(LANGUAGES);

const download = async (locales: string[]) => {
    try {
        await downloadAndSave(locales);
        cliLog.success('Download was successful');
        await checkTranslations(REQUIRED_LOCALES);
    } catch (e: any) {
        cliLog.error(e.message);
        process.exit(1);
    }
};

const upload = async () => {
    try {
        // check for unused base-locale strings before uploading
        await checkUnusedMessages();
        const result = await uploadLocales();
        cliLog.success(`Upload was successful with response: ${JSON.stringify(result)}`);
    } catch (e: any) {
        cliLog.error(e.message);
        process.exit(1);
    }
};

const renew = async () => {
    try {
        await renewLocales();
    } catch (e: any) {
        cliLog.error(e.message);
        process.exit(1);
    }
};

const validate = async (locales: string[]) => {
    try {
        await checkTranslations(locales);
    } catch (e: any) {
        cliLog.error(e.message);
        process.exit(1);
    }
};

const summary = async (isInfo: boolean) => {
    try {
        await checkTranslations(LOCALES, isInfo);
    } catch (e: any) {
        cliLog.error(e.message);
        process.exit(1);
    }
};

const unused = async () => {
    try {
        await checkUnusedMessages();
    } catch (e: any) {
        cliLog.error(e.message);
        process.exit(1);
    }
};

program
    .command('download')
    .description('Downloads messages from localization service')
    .option('-l,--locales [list...]', 'specific list of space-separated locales')
    .action((opts: { locales: string[] }) => {
        const locales = opts.locales && opts.locales.length > 0 ? opts.locales : LOCALES;
        download(locales);
    });

program
    .command('upload')
    .description('Uploads base messages to the localization service')
    .action(upload);

program
    .command('renew')
    .description('Removes old messages from locale messages')
    .action(renew);

program
    .command('validate')
    .description('Validates translations')
    .option('-R,--min', 'for only our required locales')
    .option('-l,--locales [list...]', 'for specific list of space-separated locales')
    .action((opts: { locales: string[], min: boolean }) => {
        let locales;
        if (opts.min) {
            locales = REQUIRED_LOCALES;
        } else if (opts.locales && opts.locales.length > 0) {
            locales = opts.locales;
        } else {
            // defaults to validate all locales
            locales = LOCALES;
        }
        validate(locales);
    });

program
    .command('info')
    .description('Shows locales info')
    .option('-s,--summary', 'for all locales translations readiness')
    .option('-N,--unused', 'for unused base-lang strings')
    .action((opts: { locales: string[], unused: boolean, summary: boolean }) => {
        const IS_INFO = true;
        if (opts.summary) {
            summary(IS_INFO);
        } else if (opts.unused) {
            unused();
        } else if (!opts.summary && !opts.unused) {
            summary(IS_INFO);
            unused();
        }
    });

program.parse(process.argv);
