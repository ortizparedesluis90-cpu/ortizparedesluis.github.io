/*
 * Catálogo AKL — datos de productos
 *
 * Cada producto lleva el PRECIO SOCIO de referencia. El precio que ve el
 * cliente se calcula solo: precioSocio + AUMENTO (S/ 5.00).
 *
 *   nombre       Nombre del producto
 *   categoria    Se usa para los filtros del catálogo
 *   precioSocio  Precio socio de referencia, en soles (número)
 *   imagen       URL de la imagen (puede ser la misma de la tienda original)
 *   descripcion  Texto que aparece en la ficha del producto
 *
 * Los productos marcados con `ejemplo: true` son solo para ver el diseño:
 * bórralos cuando cargues los productos reales.
 */

const AUMENTO = 5;

// Número de WhatsApp para consultas (código de país + número, sin "+" ni espacios)
const WHATSAPP = "51999999999";

const PRODUCTOS = [
  {
    ejemplo: true,
    nombre: "Producto de ejemplo 1",
    categoria: "Categoría A",
    precioSocio: 45.0,
    imagen: "",
    descripcion: "Aquí va la descripción del producto, tal como aparece en la tienda original."
  },
  {
    ejemplo: true,
    nombre: "Producto de ejemplo 2",
    categoria: "Categoría A",
    precioSocio: 60.0,
    imagen: "",
    descripcion: "Aquí va la descripción del producto, tal como aparece en la tienda original."
  },
  {
    ejemplo: true,
    nombre: "Producto de ejemplo 3",
    categoria: "Categoría B",
    precioSocio: 32.5,
    imagen: "",
    descripcion: "Aquí va la descripción del producto, tal como aparece en la tienda original."
  },
  {
    ejemplo: true,
    nombre: "Producto de ejemplo 4",
    categoria: "Categoría C",
    precioSocio: 89.9,
    imagen: "",
    descripcion: "Aquí va la descripción del producto, tal como aparece en la tienda original."
  }
];
