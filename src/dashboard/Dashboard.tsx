import { Alert, Box, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { DashboardActivityLog } from './DashboardActivityLog';
import { DealsChart } from './DealsChart';
import { HotContacts } from './HotContacts';
import { TasksList } from './TasksList';
import { Welcome } from './Welcome';
import { useGetList } from 'react-admin';
import { Contact, ContactNote } from '../types';
import { DashboardStepper } from './DashboardStepper';

export const Dashboard = () => {
    const {
        data: dataContact,
        total: totalContact,
        isPending: isPendingContact,
        error: errorContacts,
    } = useGetList<Contact>('contacts', {
        pagination: { page: 1, perPage: 1 },
    });

    const { total: totalContactNotes, isPending: isPendingContactNotes, error: errorNotes } =
        useGetList<ContactNote>('contactNotes', {
            pagination: { page: 1, perPage: 1 },
        });

    const { total: totalDeal, isPending: isPendingDeal, error: errorDeals } = useGetList<Contact>(
        'deals',
        {
            pagination: { page: 1, perPage: 1 },
        }
    );

    const isPending = isPendingContact || isPendingContactNotes || isPendingDeal;
    const anyError = errorContacts || errorNotes || errorDeals;

    if (isPending) {
        return (
            <Box display="flex" alignItems="center" justifyContent="center" sx={{ height: 360 }}>
                <Stack alignItems="center" spacing={2}>
                    <CircularProgress size={28} />
                    <Typography variant="body2" color="text.secondary">Loading dashboard…</Typography>
                </Stack>
            </Box>
        );
    }

    if (anyError) {
        return (
            <Box sx={{ p: 2 }}>
                <Alert severity="error">
                    Unable to load dashboard data. {String((anyError as any)?.message || anyError)}
                </Alert>
            </Box>
        );
    }

    if (!totalContact) {
        return <DashboardStepper step={1} />;
    }

    if (!totalContactNotes) {
        return <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />;
    }

    return (
        <Grid container spacing={2} mt={1} rowGap={4}>
            <Grid item xs={12} md={3}>
                <Stack gap={4}>
                    {import.meta.env.VITE_IS_DEMO === 'true' ? (
                        <Welcome />
                    ) : null}
                    <HotContacts />
                </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
                <Stack gap={4}>
                    {totalDeal ? <DealsChart /> : null}
                    <DashboardActivityLog />
                </Stack>
            </Grid>

            <Grid item xs={12} md={3}>
                <TasksList />
            </Grid>
        </Grid>
    );
};
