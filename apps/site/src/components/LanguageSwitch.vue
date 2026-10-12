<script setup lang="ts">
import { SelectButton } from '@vitral/vue';
import { lang, langs, languages, setLang, t, type Lang } from '../lib/i18n';

const options = langs.map((value) => ({ value, label: languages[value].short, title: languages[value].name }));
</script>

<template>
    <SelectButton
        :modelValue="lang"
        :options="options"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        size="small"
        :label="t('Language')"
        @update:modelValue="setLang($event as Lang)"
    />
</template>
