import { CRM } from './root/CRM';
import { dataProvider as fakerDataProvider, authProvider as fakerAuthProvider } from './providers/fakerest';

/**
 * Application entry point
 *
 * Customize Atomic CRM by passing props to the CRM component:
 *  - contactGender
 *  - companySectors
 *  - darkTheme
 *  - dealCategories
 *  - dealPipelineStatuses
 *  - dealStages
 *  - lightTheme
 *  - logo
 *  - noteStatuses
 *  - taskTypes
 *  - title
 * ... as well as all the props accepted by react-admin's <Admin> component.
 *
 * @example
 * const App = () => (
 *    <CRM
 *       logo="./img/logo.png"
 *       title="Acme CRM"
 *    />
 * );
 */
const App = () => {
	const useFake = import.meta.env.VITE_USE_FAKEREST === 'true';
	return (
		<CRM
			{...(useFake
				? {
					  dataProvider: fakerDataProvider,
					  authProvider: fakerAuthProvider,
				  }
				: {})}
		/>
	);
};

export default App;
