import {
    action,
    computed,
    flow,
    makeObservable,
    observable,
    runInAction,
} from 'mobx';

import {
    FilterInfo,
    CategoriesType,
    FiltersGroupId,
    OptionsData,
    RuleSetCounters,
} from 'Common/constants/common';
import { DEFAULT_SETTINGS, OPTION_SETTINGS, SETTINGS_NAMES } from 'Common/constants/settings-constants';
import { log } from 'Common/logger';

import { sender } from '../messaging/sender';

import type { RootStore } from './RootStore';

const {
    MAX_NUMBER_OF_REGEX_RULES,
} = chrome.declarativeNetRequest;

export enum STATIC_FILTERS_LIMITS_ERROR {
    MAX_STATIC_RULES_EXCEED,
    MAX_STATIC_REGEXPS_EXCEED,
    MAX_STATIC_FILTERS_EXCEED,
}

export class SettingsStore {
    public rootStore: RootStore;

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore;
        makeObservable(this);
    }

    @observable
    settings: OPTION_SETTINGS = DEFAULT_SETTINGS;

    @observable
    filters: FilterInfo[] = [];

    @observable
    categories: CategoriesType = [];

    @observable
    availableStaticRulesCount: number = 0;

    @observable
    optionsDataReady = false;

    @observable
    ruleSetsCounters: RuleSetCounters[] = [];

    @action
    updateFilterState = (filterId: number, filterProps: Partial<FilterInfo>) => {
        const filter = this.filters.find((f) => f.id === filterId);
        if (!filter) {
            throw new Error('filterId should be in the list of filters');
        }
        const idx = this.filters.indexOf(filter);
        this.filters[idx] = { ...filter, ...filterProps };
    };

    @action
    closeUpdatedFiltersListWarning = async () => {
        const { setLoader } = this.rootStore.uiStore;
        setLoader(true);

        await this.setFiltersChangedList([]);

        setLoader(false);
    };

    canEnableFilter = (filterId: number): STATIC_FILTERS_LIMITS_ERROR | null => {
        if (!this.canEnableFilterRules(filterId)) {
            return STATIC_FILTERS_LIMITS_ERROR.MAX_STATIC_RULES_EXCEED;
        }
        if (!this.canEnableFilterRegexps(filterId)) {
            return STATIC_FILTERS_LIMITS_ERROR.MAX_STATIC_REGEXPS_EXCEED;
        }
        if (this.isMaxEnabledFilters) {
            return STATIC_FILTERS_LIMITS_ERROR.MAX_STATIC_FILTERS_EXCEED;
        }

        return null;
    };

    @action
    enableFilter = async (filterId: number): Promise<STATIC_FILTERS_LIMITS_ERROR | null> => {
        // Check for limits only static filters
        const filterToEnable = this.filters.find((f) => f.id === filterId);
        if (filterToEnable?.groupId === FiltersGroupId.MAIN || filterToEnable?.groupId === FiltersGroupId.LANGUAGES) {
            const err = this.canEnableFilter(filterId);
            if (err !== null) {
                return err;
            }
        }

        await this.toggleFilter(filterId, true);

        return null;
    };

    @action
    disableFilter = async (filterId: number) => {
        await this.toggleFilter(filterId, false);
    };

    @action
    toggleFilter = async (filterId: number, value: boolean) => {
        const { setLoader } = this.rootStore.uiStore;
        setLoader(true);
        this.updateFilterState(filterId, { enabled: value });
        try {
            if (value) {
                await sender.enableFilter(filterId);
            } else {
                await sender.disableFilter(filterId);
            }
            await this.updateLimitations();
            this.rootStore.optionsStore.checkLimitsAndNotify();
        } catch (e: any) {
            log.debug(e.message);
            this.updateFilterState(filterId, { enabled: !value });
        }
        setLoader(false);
    };

    @action
    updateFilterTitle = async (filterId: number, filterTitle: string) => {
        this.updateFilterState(filterId, { title: filterTitle });
        try {
            await sender.updateFilterTitle(filterId, filterTitle);
            this.rootStore.customFilterModalStore.closeModal();
        } catch (e: any) {
            log.debug(e.message);
        }
    };

    @action
    updateLimitations = async () => {
        const availableStaticRulesCount = await chrome.declarativeNetRequest.getAvailableStaticRuleCount();
        runInAction(() => {
            this.availableStaticRulesCount = availableStaticRulesCount;
        });

        await this.rootStore.optionsStore.updateDynamicRulesStatus();
    };

    @flow* getOptionsData() {
        const { setLoader } = this.rootStore.uiStore;
        setLoader(true);
        const {
            settings, filters, categories, ruleSetsCounters,
        }: OptionsData = yield sender.getOptionsData();
        this.settings = settings;
        this.filters = filters;
        this.categories = categories;
        this.ruleSetsCounters = ruleSetsCounters;

        yield this.updateLimitations();

        setLoader(false);
    }

    @action setOptionsDataLoaded() {
        this.optionsDataReady = true;
    }

    @action
    setNoticeHidden = async (value: boolean) => {
        try {
            await sender.setSetting({ [SETTINGS_NAMES.NOTICE_HIDDEN]: value });
        } catch (e) {
            log.error(e);
            return;
        }

        runInAction(() => {
            this.settings[SETTINGS_NAMES.NOTICE_HIDDEN] = value;
        });
    };

    @action
    setFiltersChangedList = async (value: number[]) => {
        try {
            await sender.setSetting({ [SETTINGS_NAMES.FILTERS_CHANGED]: value });
        } catch (e) {
            log.error(e);
            return;
        }

        runInAction(() => {
            this.settings[SETTINGS_NAMES.FILTERS_CHANGED] = value;
        });
    };

    @action
    setSetting = async (settingName: keyof OPTION_SETTINGS, value: any) => {
        try {
            const response: any = await sender.setSetting({ [settingName]: value });
            if (response.type === 'success')
                runInAction(() => {
                    this.settings[settingName] = value as never ; 
                });
            return response;
        } catch (e) {
            log.error(e);
            return;
        }
    };

    @action
    updateModel = async (url: string) => {
        try {
            const response = await sender.updateModel(url);
            return response;
        } catch (e) {
            log.error(e);
            return e;
        }
    };

    @computed
    get noticeHidden() {
        return this.settings[SETTINGS_NAMES.NOTICE_HIDDEN];
    }

    @flow* addCustomFilterByContent(filterContent: string, title: string, url: string) {
        const { setLoader } = this.rootStore.uiStore;
        setLoader(true);

        try {
            this.filters = yield sender.addCustomFilterByContent(filterContent, title, url);
            this.rootStore.customFilterModalStore.closeModal();
            yield this.updateLimitations();
        } catch (e: any) {
            log.error(e.message);
        }

        setLoader(false);
    }

    @flow* removeCustomFilterById(filterId: number) {
        const { setLoader } = this.rootStore.uiStore;
        setLoader(true);

        try {
            this.filters = yield sender.removeCustomFilterById(filterId);
            this.rootStore.customFilterModalStore.closeModal();
            yield this.updateLimitations();
        } catch (e: any) {
            log.error(e.message);
        }

        setLoader(false);
    }

    @flow* relaunchFiltering(wasEnabledIds: number[]) {
        const { setLoader } = this.rootStore.uiStore;
        setLoader(true);

        try {
            yield sender.relaunchFiltering(wasEnabledIds);
            yield this.getOptionsData();
        } catch (e: any) {
            log.error(e.message);
        }

        setLoader(false);
    }

    @computed
    get enabledStaticRules(): number {
        return this.filters
            .filter((f) => f.enabled && f.groupId !== FiltersGroupId.CUSTOM)
            .reduce((sum, filter) => {
                const ruleSet = this.ruleSetsCounters.find((r) => r.filterId === filter.id);
                const declarativeRulesCounter = ruleSet?.rulesCount;

                if (declarativeRulesCounter) {
                    return sum + declarativeRulesCounter;
                }

                return sum;
            }, 0);
    }

    @computed
    get enabledStaticFiltersCounter(): number {
        return this.filters
            .filter((f) => f.enabled && f.groupId !== FiltersGroupId.CUSTOM)
            .length;
    }

    @computed
    get isMaxEnabledFilters(): boolean {
        return this.enabledStaticFiltersCounter >= chrome.declarativeNetRequest.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS;
    }

    @computed
    get brokenFiltersList(): boolean {
        return this.settings[SETTINGS_NAMES.FILTERS_CHANGED].length > 0;
    }

    @computed
    get enabledStaticFiltersRegexps(): number {
        return this.filters
            .filter((f) => f.enabled && f.groupId !== FiltersGroupId.CUSTOM)
            .reduce((sum, filter) => {
                const ruleSet = this.ruleSetsCounters.find((r) => r.filterId === filter.id);
                const regexpRulesCounter = ruleSet?.regexpRulesCount;

                if (regexpRulesCounter) {
                    return sum + regexpRulesCounter;
                }

                return sum;
            }, 0);
    }

    getFilterById = (filterId: number): FilterInfo | null => {
        return this.filters.find((filter) => filter.id === filterId) || null;
    };

    canEnableFilterRules = (filterId: number): boolean => {
        const filterToEnable = this.filters.find((f) => f.id === filterId);
        if (!filterToEnable) {
            return false;
        }

        const ruleSet = this.ruleSetsCounters.find((r) => r.filterId === filterToEnable.id);
        const declarativeRulesCounter = ruleSet?.rulesCount;
        if (declarativeRulesCounter === undefined) {
            return false;
        }

        return declarativeRulesCounter <= this.availableStaticRulesCount;
    };

    canEnableFilterRegexps = (filterId: number): boolean => {
        const filterToEnable = this.filters
            .find((f) => f.id === filterId);
        if (!filterToEnable) {
            return false;
        }

        const ruleSet = this.ruleSetsCounters.find((r) => r.filterId === filterToEnable.id);
        const regexpRulesCounter = ruleSet?.regexpRulesCount;
        if (regexpRulesCounter === undefined) {
            return false;
        }

        return this.enabledStaticFiltersRegexps + regexpRulesCounter <= MAX_NUMBER_OF_REGEX_RULES;
    };
}
