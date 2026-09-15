import type { IconName } from "../components/Icon.astro";

export type Service = {
	slug: string;
	titulo: string;
	kicker: string;
	descripcion: string;
	descripcionLarga: string;
	entregables: string[];
	icon: IconName;
	metaDesc: string;
};

export const servicios: Service[] = [
	{
		slug: "diagnostico",
		titulo: "Diagnóstico de Transformación Digital",
		kicker: "El punto de partida",
		descripcion:
			"Auditamos tus procesos de punta a punta y te devolvemos un mapa accionable: dónde se pierde tiempo, plata y gente.",
		descripcionLarga:
			"Entendemos tu operación real antes de proponer cualquier cosa. Relevamos procesos, data y herramientas; medimos el costo del trabajo manual y priorizamos las iniciativas con mayor impacto. El resultado no es un informe: es un plan concreto con caso de negocio por iniciativa.",
		entregables: [
			"Mapa de procesos",
			"Matriz de impacto/beneficio",
			"Roadmap de transformación",
			"Caso de negocio por iniciativa",
		],
		icon: "punto",
		metaDesc:
			"Auditoría de procesos de punta a punta con roadmap accionable y caso de negocio por iniciativa.",
	},
	{
		slug: "datos",
		titulo: "Datos",
		kicker: "La base de todo",
		descripcion:
			"Pipelines, consolidación y calidad de datos para que tus sistemas hablen el mismo idioma.",
		descripcionLarga:
			"Conectamos tus fuentes —ERP, planillas, APIs, sistemas legados— en un solo lugar con calidad garantizada. Datos limpios, repetibles y disponibles para decidir, reportar y alimentar modelos de IA sin que el equipo pierda horas reconciliando.",
		entregables: [
			"Pipelines de datos",
			"Consolidación de fuentes",
			"Calidad y gobierno de datos",
			"Data warehouse / lakehouse",
		],
		icon: "dato",
		metaDesc:
			"Pipelines, consolidación y calidad de datos para que tus sistemas hablen el mismo idioma.",
	},
	{
		slug: "automatizacion-software",
		titulo: "Automatización y Software",
		kicker: "Operación 24/7",
		descripcion:
			"Tus procesos corren solos 24/7 y tu operación se vuelve producto software.",
		descripcionLarga:
			"Los procesos que hoy hacen tus operarios pasan a correr solos con registro y trazabilidad de cada paso. Y donde la operación se repite, la convertimos en software a medida: plataformas y apps integradas con tus herramientas, entregadas por etapas.",
		entregables: [
			"Flujos RPA y orquestación",
			"Agentes de IA",
			"Plataformas y apps a medida",
			"Integraciones con ERP/APIs",
		],
		icon: "zap",
		metaDesc:
			"Automatización de procesos con RPA e IA y software a medida, integrado y entregado por etapas.",
	},
];