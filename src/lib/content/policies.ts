export type ProductLocale = 'en' | 'it';

export const policyVersions = {
	terms: '2026-08-15',
	privacyNotice: '2026-08-15',
	contributionDisclosure: '2026-08-15',
	ageDeclaration: '2026-08-15',
	reviewRules: '2026-08-15-draft',
	moderationExplanation: '2026-08-15-draft'
} as const;

export const controller = {
	name: 'Luca Fornasari',
	email: 'fornaeffe@gmail.com',
	address: 'via Picedi Benettini 6, 43123 Parma, Italia'
} as const;

export const contributionDisclosure: Record<ProductLocale, string> = {
	en: 'Your rankings stay private in the interface. GustiMei uses pseudonymous preference comparisons to improve recommendations for you and the community. Public reviews are separate, optional, and never affect ranking or recommendation scores.',
	it: 'Le tue classifiche restano private nell’interfaccia. GustiMei usa confronti di preferenza pseudonimi per migliorare i consigli per te e per la comunità. Le recensioni pubbliche sono separate, facoltative e non influenzano mai classifiche o consigli.'
};

export const legalContent = {
	en: {
		terms: {
			title: 'Terms of use',
			intro:
				'These local-development terms describe the intended GustiMei service. They require legal approval before any external beta.',
			sections: [
				[
					'Who may use GustiMei',
					'You must be at least 18 years old and provide accurate account information.'
				],
				['Ranking and recommendations', contributionDisclosure.en],
				[
					'Your choices',
					'You can stop, resume, undo where offered, delete a category ranking, and request account erasure. Recommendations are suggestions, not guarantees.'
				],
				[
					'Public contributions',
					'Reviews are optional and governed by the separate review rules. Do not submit unlawful, fabricated, incentivized, or privacy-invasive content.'
				]
			]
		},
		privacy: {
			title: 'Privacy notice',
			intro: `Provisional controller: ${controller.name}, ${controller.email}, ${controller.address}. Legal review is required before external beta.`,
			sections: [
				[
					'Account data',
					'We process account, session, verification, locale, and registration records to provide and secure the service.'
				],
				[
					'Private preference data',
					'Visited places, comparisons, rankings, and private comments are visible only to you. Pseudonymous comparison evidence contributes to recommendation models under the documented participation policy. Private comment text never does.'
				],
				[
					'Public reviews',
					'A review is a separate optional public contribution under a public pseudonym. Review text, declarations, service-date records, notices, and case evidence never train or score recommendations.'
				],
				[
					'Tracking and rights',
					'The MVP uses no advertising, cross-site tracking, fingerprinting, or session replay. You may request access, restriction, deletion, ranking-category deletion, review withdrawal, and account erasure.'
				]
			]
		},
		reviews: {
			title: 'Review rules',
			intro:
				'Reviews are optional public text, separate from your private ranking and private notes. These rules are provisional pending legal review.',
			sections: [
				[
					'Experience and timing',
					'You must declare that you personally used the service, that the review concerns that experience, and that no incentive produced it. The service date must be within the previous 30 Italian calendar days and is shown publicly only as month and year.'
				],
				[
					'Public identity and verification',
					'Publication requires a verified account and a unique public pseudonym. GustiMei labels the experience “not independently verified”; declarations do not make a fictitious review acceptable.'
				],
				[
					'Editing and expiry',
					'Ordinary edits are available only within the original 30-day window and preserve the original publication and expiry dates. A later visit creates a substitution. A review expires two years after first publication and may be withdrawn at any time.'
				],
				[
					'Challenges and evidence',
					'Anyone may report a specific version. A report does not automatically remove it. Parties may be asked for restricted evidence; human review may restrict visibility, give reasons, and provide a redress route. Evidence is never public.'
				]
			]
		},
		moderation: {
			title: 'Moderation, notices, and redress',
			intro: 'GustiMei applies the same process to favorable and unfavorable reviews.',
			sections: [
				[
					'Submitting a notice',
					'Identify the exact review version, explain the alleged illegality or rule breach, and provide truthful contact details. Owners and delegates use the same mechanism with an explicit role assertion.'
				],
				[
					'Review process',
					'A report is acknowledged and assessed without treating the allegation as proven. Both sides may provide facts. Temporary restriction is used only for an objectively documented need.'
				],
				[
					'Decision and appeal',
					'Human decisions state the outcome, grounds, and available redress. Reinstatement is recorded and communicated when a restriction is reversed.'
				],
				[
					'Evidence handling',
					'Evidence is access-controlled, audited, scanned where supported, and deleted on the documented deadline unless a narrow, expiring hold applies.'
				]
			]
		}
	},
	it: {
		terms: {
			title: 'Termini di utilizzo',
			intro:
				'Questi termini per lo sviluppo locale descrivono il servizio GustiMei previsto. Richiedono approvazione legale prima di qualsiasi beta esterna.',
			sections: [
				[
					'Chi può usare GustiMei',
					'Devi avere almeno 18 anni e fornire informazioni corrette per l’account.'
				],
				['Classifiche e consigli', contributionDisclosure.it],
				[
					'Le tue scelte',
					'Puoi interrompere, riprendere, annullare dove previsto, eliminare una classifica di categoria e chiedere la cancellazione dell’account. I consigli sono suggerimenti, non garanzie.'
				],
				[
					'Contributi pubblici',
					'Le recensioni sono facoltative e seguono regole separate. Non inviare contenuti illeciti, inventati, incentivati o lesivi della privacy.'
				]
			]
		},
		privacy: {
			title: 'Informativa privacy',
			intro: `Titolare provvisorio: ${controller.name}, ${controller.email}, ${controller.address}. È necessaria una revisione legale prima della beta esterna.`,
			sections: [
				[
					'Dati dell’account',
					'Trattiamo account, sessione, verifica, lingua e attestazioni di registrazione per fornire e proteggere il servizio.'
				],
				[
					'Preferenze private',
					'Luoghi visitati, confronti, classifiche e note private sono visibili solo a te. Le evidenze di confronto pseudonime contribuiscono ai modelli di consiglio secondo la politica di partecipazione documentata. Il testo delle note private non contribuisce mai.'
				],
				[
					'Recensioni pubbliche',
					'Una recensione è un contributo pubblico separato e facoltativo, pubblicato con pseudonimo. Testo, dichiarazioni, data del servizio, segnalazioni ed evidenze non addestrano né influenzano i consigli.'
				],
				[
					'Tracciamento e diritti',
					'L’MVP non usa pubblicità, tracciamento tra siti, fingerprinting o registrazione delle sessioni. Puoi chiedere accesso, limitazione, cancellazione, eliminazione di una classifica, ritiro della recensione ed eliminazione dell’account.'
				]
			]
		},
		reviews: {
			title: 'Regole per le recensioni',
			intro:
				'Le recensioni sono testi pubblici facoltativi, separati dalla classifica e dalle note private. Le regole sono provvisorie in attesa di revisione legale.',
			sections: [
				[
					'Esperienza e tempi',
					'Devi dichiarare di aver usato personalmente il servizio, che il testo riguarda quell’esperienza e che non hai ricevuto incentivi. La data deve essere negli ultimi 30 giorni di calendario italiani ed è mostrata solo come mese e anno.'
				],
				[
					'Identità pubblica e verifica',
					'La pubblicazione richiede un account verificato e uno pseudonimo pubblico unico. GustiMei indica “esperienza non verificata indipendentemente”; le dichiarazioni non rendono lecita una recensione inventata.'
				],
				[
					'Modifiche e scadenza',
					'Le modifiche ordinarie sono possibili solo nella finestra iniziale di 30 giorni e mantengono data di pubblicazione e scadenza. Una visita successiva crea una sostituzione. La recensione scade dopo due anni e può essere ritirata in ogni momento.'
				],
				[
					'Contestazioni ed evidenze',
					'Chiunque può segnalare una versione precisa. La segnalazione non la rimuove automaticamente. Le parti possono fornire evidenze riservate; una revisione umana può limitare la visibilità, motivare la decisione e offrire ricorso. Le evidenze non sono pubbliche.'
				]
			]
		},
		moderation: {
			title: 'Moderazione, segnalazioni e ricorsi',
			intro: 'GustiMei applica lo stesso processo alle recensioni favorevoli e sfavorevoli.',
			sections: [
				[
					'Inviare una segnalazione',
					'Indica la versione esatta, spiega la presunta illegalità o violazione e fornisci contatti veritieri. Titolari e delegati usano lo stesso meccanismo dichiarando il proprio ruolo.'
				],
				[
					'Valutazione',
					'La segnalazione viene ricevuta e valutata senza considerare provata l’accusa. Entrambe le parti possono fornire fatti. La limitazione temporanea è usata solo per un’esigenza documentata.'
				],
				[
					'Decisione e ricorso',
					'Le decisioni umane indicano esito, motivi e possibilità di ricorso. Il ripristino viene registrato e comunicato quando una limitazione è annullata.'
				],
				[
					'Gestione delle evidenze',
					'Le evidenze hanno accesso ristretto e registrato, sono analizzate ove supportato e cancellate alla scadenza prevista salvo una conservazione limitata, motivata e temporanea.'
				]
			]
		}
	}
} as const;
