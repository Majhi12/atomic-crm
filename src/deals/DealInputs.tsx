import {
    Divider,
    Stack,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import {
    AutocompleteArrayInput,
    AutocompleteInput,
    DateInput,
    NumberInput,
    ReferenceArrayInput,
    ReferenceInput,
    required,
    SelectInput,
    TextInput,
    useCreate,
    useGetIdentity,
    useNotify,
} from 'react-admin';
import { useEffect, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { supabase } from '../providers/supabase/supabase';
import { useConfigurationContext } from '../root/ConfigurationContext';
import { contactInputText, contactOptionText } from '../misc/ContactOption';

const validateRequired = required();

export const DealInputs = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    return (
        <Stack gap={4} p={1}>
            <DealInfoInputs />

            <Stack gap={4} flexDirection={isMobile ? 'column' : 'row'}>
                <DealLinkedToInputs />
                <Divider
                    orientation={isMobile ? 'horizontal' : 'vertical'}
                    flexItem
                />
                <DealMiscInputs />
            </Stack>
        </Stack>
    );
};

const DealInfoInputs = () => {
    return (
        <Stack gap={1} flex={1}>
            <TextInput
                source="name"
                label="Deal name"
                validate={validateRequired}
                helperText={false}
            />
            <TextInput
                source="description"
                multiline
                rows={3}
                helperText={false}
            />
        </Stack>
    );
};

const DealLinkedToInputs = () => {
    const [create] = useCreate();
    const notify = useNotify();
    const { identity } = useGetIdentity();

    const handleCreateCompany = async (name?: string) => {
        if (!name) return;
        try {
            const newCompany = await create(
                'companies',
                {
                    data: {
                        name,
                        sales_id: identity?.id,
                        created_at: new Date().toISOString(),
                    },
                },
                { returnPromise: true }
            );
            return newCompany;
        } catch (error) {
            notify('An error occurred while creating the company', {
                type: 'error',
            });
        }
    };
    return (
        <Stack gap={1} flex={1}>
            <Typography variant="subtitle1">Linked to</Typography>
            <ReferenceInput source="company_id" reference="companies">
                <AutocompleteInput
                    optionText="name"
                    onCreate={handleCreateCompany}
                    validate={validateRequired}
                    helperText={false}
                />
            </ReferenceInput>

            <ReferenceArrayInput
                source="contact_ids"
                reference="contacts_summary"
            >
                <AutocompleteArrayInput
                    label="Contacts"
                    optionText={contactOptionText}
                    inputText={contactInputText}
                    helperText={false}
                />
            </ReferenceArrayInput>
        </Stack>
    );
};

const DealMiscInputs = () => {
    const { dealCategories } = useConfigurationContext();
    const form = useFormContext();
    const kind: string = (useWatch({ control: form.control, name: 'deal_kind' }) as any) || 'sales';
    const [stageChoices, setStageChoices] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const { data } = await supabase
                .from('deal_stage_sets')
                .select('stage, position')
                .eq('deal_kind', kind)
                .order('position', { ascending: true });
            if (!cancelled) {
                setStageChoices((data || []).map((r: any) => ({ id: r.stage, name: r.stage })));
            }
        };
        load();
        return () => { cancelled = true; };
    }, [kind]);
    return (
        <Stack gap={1} flex={1}>
            <Typography variant="subtitle1">Misc</Typography>

            <SelectInput
                source="deal_kind"
                label="Deal kind"
                choices={[
                    { id: 'sales', name: 'Sales' },
                    { id: 'procurement', name: 'Procurement' },
                    { id: 'partnership', name: 'Partnership' },
                ]}
                defaultValue="sales"
                helperText={false}
            />
            <SelectInput
                source="category"
                label="Category"
                choices={dealCategories.map(type => ({
                    id: type,
                    name: type,
                }))}
                helperText={false}
            />
            {kind === 'procurement' ? (
                <NumberInput
                    source="cost"
                    label="Cost"
                    defaultValue={0}
                    validate={validateRequired}
                    helperText={false}
                />
            ) : (
                <NumberInput
                    source="amount"
                    label="Amount"
                    defaultValue={0}
                    validate={validateRequired}
                    helperText={false}
                />
            )}
            <DateInput
                source="expected_closing_date"
                fullWidth
                validate={[validateRequired]}
                helperText={false}
                inputProps={{ max: '9999-12-31' }}
                defaultValue={new Date().toISOString().split('T')[0]}
            />
            <SelectInput
                source="stage"
                label="Stage"
                choices={stageChoices}
                validate={validateRequired}
                helperText={false}
            />
            {kind === 'procurement' ? (
                <ReferenceInput source="vendor_company_id" reference="companies">
                    <AutocompleteInput optionText="name" helperText={false} label="Vendor" />
                </ReferenceInput>
            ) : null}
        </Stack>
    );
};
