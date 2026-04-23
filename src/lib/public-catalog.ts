export type CatalogSpecies = "dog" | "cat";
export type CatalogBias = "dog" | "balanced" | "cat";

export interface CatalogLab {
  id: string;
  name: string;
  country: string;
  species: "dog" | "cat" | "both";
}

export interface CatalogLicense {
  id: "cc-by-4.0" | "cc0" | "cc-by-nc-4.0";
  name: string;
  desc: string;
}

export interface CatalogMethod {
  name: string;
  type: "short-read" | "long-read";
}

export interface CatalogGenome {
  id: string;
  name: string;
  species: CatalogSpecies;
  breed: string;
  breedGroup: string;
  weightKg: number;
  age: number;
  sex: "Male" | "Female";
  coat: string;
  lab: CatalogLab;
  country: string;
  assembly: string;
  method: CatalogMethod;
  coverage: number;
  sizeGb: number;
  license: CatalogLicense;
  snvs: number;
  indels: number;
  svs: number;
  heterozygosity: number;
  addedDays: number;
  healthy: boolean;
  flags: string[];
}

const DOG_BREEDS = [
  { breed: "Labrador Retriever", group: "Sporting", avgKg: 32 },
  { breed: "Golden Retriever", group: "Sporting", avgKg: 30 },
  { breed: "German Shepherd", group: "Herding", avgKg: 34 },
  { breed: "French Bulldog", group: "Non-sporting", avgKg: 12 },
  { breed: "Beagle", group: "Hound", avgKg: 11 },
  { breed: "Poodle (Standard)", group: "Non-sporting", avgKg: 24 },
  { breed: "Rottweiler", group: "Working", avgKg: 50 },
  { breed: "Dachshund", group: "Hound", avgKg: 9 },
  { breed: "Shiba Inu", group: "Non-sporting", avgKg: 10 },
  { breed: "Border Collie", group: "Herding", avgKg: 18 },
  { breed: "Mixed (village dog)", group: "Landrace", avgKg: 16 },
  { breed: "Cavalier K.C. Spaniel", group: "Toy", avgKg: 7 },
  { breed: "Siberian Husky", group: "Working", avgKg: 23 },
  { breed: "Chihuahua", group: "Toy", avgKg: 3 },
  { breed: "Boxer", group: "Working", avgKg: 30 },
];

const CAT_BREEDS = [
  { breed: "Domestic Shorthair", group: "Moggy", avgKg: 4.2 },
  { breed: "Maine Coon", group: "Longhair", avgKg: 7.5 },
  { breed: "Ragdoll", group: "Longhair", avgKg: 6.5 },
  { breed: "British Shorthair", group: "Shorthair", avgKg: 5.5 },
  { breed: "Siamese", group: "Oriental", avgKg: 4.0 },
  { breed: "Bengal", group: "Shorthair", avgKg: 5.2 },
  { breed: "Sphynx", group: "Hairless", avgKg: 3.8 },
  { breed: "Persian", group: "Longhair", avgKg: 4.6 },
  { breed: "Norwegian Forest", group: "Longhair", avgKg: 5.8 },
  { breed: "Abyssinian", group: "Shorthair", avgKg: 4.0 },
  { breed: "Mixed (stray)", group: "Moggy", avgKg: 4.0 },
  { breed: "Russian Blue", group: "Shorthair", avgKg: 4.4 },
];

const PARTNER_LABS: CatalogLab[] = [
  { id: "embark", name: "Embark Veterinary", country: "US", species: "dog" },
  { id: "wisdom", name: "Wisdom Panel", country: "US", species: "both" },
  { id: "basepaws", name: "Basepaws", country: "US", species: "cat" },
  { id: "helvetica-vet", name: "Helvetica Vet Genomics", country: "CH", species: "both" },
  { id: "uzh-vet", name: "UZH Vetsuisse", country: "CH", species: "both" },
  { id: "tartu", name: "Tartu Ülikool", country: "EE", species: "dog" },
  { id: "ebi-public", name: "EBI Public Deposit", country: "UK", species: "both" },
];

const REFERENCE_ASSEMBLIES: Record<CatalogSpecies, string[]> = {
  dog: ["CanFam4", "CanFam3.1", "ROS_Cfam_1.0"],
  cat: ["F.catus_Fca126_mat1.0", "felCat9", "F.catus_9.0"],
};

const SEQUENCING_METHODS: CatalogMethod[] = [
  { name: "Illumina NovaSeq 6000", type: "short-read" },
  { name: "Illumina NovaSeq X", type: "short-read" },
  { name: "Oxford Nanopore PromethION", type: "long-read" },
  { name: "PacBio Revio", type: "long-read" },
  { name: "Illumina HiSeq X Ten", type: "short-read" },
];

const COAT_COLORS_DOG = ["Black", "Yellow", "Chocolate", "Brindle", "Merle", "Sable", "Tri-color", "White"];
const COAT_COLORS_CAT = ["Tabby", "Calico", "Tortie", "Tuxedo", "Solid black", "Solid white", "Point", "Spotted"];

const NAMES_DOG = ["Atlas","Biscuit","Clover","Django","Echo","Finn","Ghost","Hazel","Indigo","Juno","Kona","Luna","Milo","Nova","Otis","Piper","Quill","Remi","Scout","Tilly","Ursa","Vesper","Willow","Yara","Zephyr","Basil","Cedar","Ember","Fig","Hollis"];
const NAMES_CAT = ["Apricot","Binx","Calliope","Dune","Eclipse","Ferris","Ginko","Halo","Ivy","Jasper","Koda","Lichen","Moth","Nyx","Olive","Pip","Quince","Rune","Sage","Tofu","Umbra","Velvet","Whisker","Xanthe","Yuzu","Zinnia"];

const LICENSES: CatalogLicense[] = [
  { id: "cc-by-4.0", name: "CC-BY 4.0", desc: "Attribution required" },
  { id: "cc0", name: "CC0 1.0", desc: "Public domain dedication" },
  { id: "cc-by-nc-4.0", name: "CC-BY-NC 4.0", desc: "Non-commercial use" },
];

const COVERAGE_BINS = [15, 20, 20, 30, 30, 40, 60, 80];
const COUNTRIES = ["US","CH","DE","UK","JP","EE","FR","AT","CA","AU"];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function makeGenome(i: number, rng: () => number, species: CatalogSpecies): CatalogGenome {
  const breeds = species === "dog" ? DOG_BREEDS : CAT_BREEDS;
  const names = species === "dog" ? NAMES_DOG : NAMES_CAT;
  const coats = species === "dog" ? COAT_COLORS_DOG : COAT_COLORS_CAT;
  const breed = pick(rng, breeds);
  const name = pick(rng, names);
  const yearNum = 2023 + Math.floor(rng() * 4);
  const idSuffix = String(100 + i).padStart(4, "0");
  const id = `${species === "dog" ? "CAN" : "FEL"}-${yearNum}-${idSuffix}`;
  const age = Math.floor(rng() * 14) + 1;
  const sex: "Male" | "Female" = rng() > 0.5 ? "Male" : "Female";
  const coat = pick(rng, coats);
  const labPool = PARTNER_LABS.filter(l => l.species === species || l.species === "both");
  const lab = pick(rng, labPool);
  const assembly = pick(rng, REFERENCE_ASSEMBLIES[species]);
  const method = pick(rng, SEQUENCING_METHODS);
  const coverage = pick(rng, COVERAGE_BINS);
  const license = pick(rng, LICENSES);
  const sizeGb = species === "dog" ? 2.4 : 2.5;
  const snvs = Math.round((3.8 + rng() * 1.4) * 1e6);
  const indels = Math.round(snvs * (0.10 + rng() * 0.04));
  const svs = Math.round(5000 + rng() * 9000);
  const heterozygosity = +(0.001 + rng() * 0.002).toFixed(4);
  const country = pick(rng, COUNTRIES);
  const addedDays = Math.floor(rng() * 420);
  const healthy = rng() > 0.18;
  const flags: string[] = [];
  if (!healthy) flags.push(pick(rng, ["MDR1 carrier","DM risk allele","PRA carrier","HCM risk allele","PKD1 variant"]));
  if (rng() > 0.8) flags.push("hypoallergenic coat");
  if (rng() > 0.92) flags.push("long-lived lineage");
  return {
    id, name, species, breed: breed.breed, breedGroup: breed.group,
    weightKg: +(breed.avgKg * (0.85 + rng() * 0.3)).toFixed(1),
    age, sex, coat, lab, country, assembly, method,
    coverage, sizeGb, license,
    snvs, indels, svs, heterozygosity,
    addedDays, healthy, flags,
  };
}

export function buildCatalog(sampleSize = 24, bias: CatalogBias = "balanced"): CatalogGenome[] {
  const rng = mulberry32(42);
  let dogShare = 0.55;
  if (bias === "dog") dogShare = 0.8;
  if (bias === "cat") dogShare = 0.25;
  const out: CatalogGenome[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const species: CatalogSpecies = rng() < dogShare ? "dog" : "cat";
    out.push(makeGenome(i, rng, species));
  }
  return out;
}

export interface CatalogStats {
  dogs: number;
  cats: number;
  total: number;
  breeds: number;
  labs: number;
  totalGb: number;
}

export function catalogStats(all: CatalogGenome[]): CatalogStats {
  const dogs = all.filter(g => g.species === "dog").length;
  const cats = all.filter(g => g.species === "cat").length;
  const breeds = new Set(all.map(g => g.breed)).size;
  const labs = new Set(all.map(g => g.lab.id)).size;
  const totalGb = all.reduce((s, g) => s + g.sizeGb, 0);
  return { dogs, cats, total: all.length, breeds, labs, totalGb };
}

export const fmt = (n: number) => n.toLocaleString("en-US");
export const gb = (n: number) => n.toFixed(1) + " GB";
export const ago = (days: number) => {
  if (days < 1) return "today";
  if (days < 30) return days + "d ago";
  if (days < 365) return Math.floor(days / 30) + "mo ago";
  return Math.floor(days / 365) + "y ago";
};
