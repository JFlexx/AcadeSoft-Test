# Qué es AcadeSoft y qué cubre

> Documento en lenguaje sencillo, pensado para alguien **sin conocimientos de
> programación** (un socio del proyecto o un cliente). Explica qué hace el
> producto hoy, para quién es, y qué queda por hacer.

---

## En una frase

**AcadeSoft es un programa por internet (SaaS) para gestionar una academia:**
alumnos, profesores, clases, asistencia, facturación y cobros — incluyendo el
**cobro online con tarjeta**, un **portal para las familias**, la
**inscripción online** de nuevos alumnos, el cumplimiento legal de la
facturación española (Veri\*Factu) y las domiciliaciones bancarias (SEPA).

Es un competidor mejorado de **Acadesoft** (acadesoft.com): mismo tipo de
cliente, pero como **SaaS moderno** — la operación y el cobro tienden al
piloto automático, y las familias se auto-gestionan.

---

## ¿Para quién es?

Academias y centros de formación que necesitan llevar, en un solo sitio:

- Quién es su alumnado y qué clases recibe.
- Qué profesores imparten qué grupos.
- El calendario de clases y la asistencia.
- La facturación mensual y el cobro (en mano, transferencia o domiciliación).
- El cumplimiento de la normativa fiscal española.

Cada academia tiene su propio espacio aislado: **una misma instalación da
servicio a muchas academias** sin que se mezclen sus datos (esto se llama
"multi-tenant"). Cualquiera puede **darse de alta solo** desde la web.

---

## Cómo está organizado (las secciones de la app)

Al entrar, en el menú lateral hay estas secciones:

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Panel con las cifras clave del día: alumnos activos, grupos, clases de la semana, facturado y cobrado del mes, facturas pendientes. |
| **Alumnos** | Listado y alta de alumnos, con su ficha individual. Exportable a Excel. |
| **Profesores** | Listado y alta de profesores, con su ficha individual. |
| **Cursos** | Las materias que se imparten (Inglés, Piano, Matemáticas…), con color. |
| **Grupos** | Las clases concretas dentro de un curso, con su cuota mensual, aforo y profesor. |
| **Calendario** | Agenda de clases en vista semanal o mensual. Exportable a Google/Apple Calendar. |
| **Facturas** | Todas las facturas, con su estado de cobro. Exportable a Excel. |
| **Mensualidades** | Generar de golpe las facturas del mes y la remesa bancaria SEPA. |
| **Ajustes** | Datos fiscales de la academia, contacto y configuración bancaria. |

---

## Funcionalidades, una por una

### 1. Alumnos
- Alta, edición y baja de alumnos (nombre, contacto, fecha de nacimiento, etc.).
- **Ficha del alumno**: en un vistazo, sus datos de contacto, su domiciliación
  bancaria, sus grupos y **todas sus facturas con el total cobrado y pendiente**.
- **Descuento de familia/hermanos**: a cada alumno se le puede poner un % de
  descuento que se aplica automáticamente a su mensualidad.
- **Exportar a Excel** (CSV) el listado completo.

### 2. Profesores
- Alta, edición y baja.
- **Ficha del profesor**: sus grupos y sus próximas clases.

### 3. Cursos y grupos
- **Cursos**: la materia (con un color para identificarla visualmente).
- **Grupos**: la clase concreta dentro de un curso, con **cuota mensual**,
  aforo máximo, profesor asignado y fechas.

### 4. Inscripciones
- Apuntar a un alumno a un grupo.
- Estado de cada inscripción: activa, pendiente, completada o baja.
- Se puede fijar una **cuota distinta para un alumno concreto** en un grupo
  (por ejemplo, una beca puntual), sin cambiar la del resto.

### 5. Calendario y clases (sesiones)
- **Agenda visual** de todas las clases, en vista **semanal** o **mensual**.
- Filtros por grupo y por profesor; cada clase aparece con el color de su curso.
- **Exportar a `.ics`**: se importa en Google Calendar / Apple Calendar.

### 6. Asistencia
- En cada clase se puede **pasar lista**: presente, ausente, tarde o justificado,
  con notas.

### 7. Facturación
- Facturas manuales (un cobro suelto) o automáticas (ver Mensualidades).
- **Numeración correlativa por academia** (ej. `F-2026-0001`), como exige la ley.
- **PDF descargable** de cada factura, con los datos fiscales de la academia.

### 8. Cobros y pagos
- Registrar pagos en **efectivo, tarjeta o transferencia**, totales o parciales.
- **Pago online con tarjeta**: la factura lleva un botón "Pagar con tarjeta"
  (y las familias pueden pagar desde su portal). El cobro se procesa en una
  página segura de **Stripe** y la factura se marca **pagada sola**.
- La factura cambia de estado sola: pendiente → parcial → **cobrada**.
- **Detección automática de impagos**: las facturas que pasan de su fecha de
  vencimiento sin pagar se marcan como **vencidas** cada día, para saber a
  quién hay que reclamar.
- Totales de **facturado, cobrado y pendiente** a la vista.

### 9. Mensualidades recurrentes
- Con un clic, **generar todas las facturas del mes** para los alumnos con
  cuota, en lugar de una a una.
- **Vista previa** antes de generar, y es **idempotente**: si se vuelve a
  lanzar, no duplica las que ya existen.
- Aplica automáticamente los descuentos de familia.

### 10. Domiciliación bancaria (SEPA)
- Genera el **fichero XML que se sube al banco** para cobrar por domiciliación
  (norma SEPA `pain.008`), a partir de las facturas pendientes del mes.
- Cada alumno guarda su IBAN y su mandato de domiciliación.
- Vista previa de qué se va a cobrar y a quién, y por qué se omite a alguien
  (p. ej. si le falta el mandato).

### 11. Cumplimiento legal de facturación (Veri\*Factu)
La ley española antifraude (RD 1007/2023) exige que las facturas no se puedan
manipular. AcadeSoft lo cumple así, **de forma transparente para el usuario**:
- **Cadena de seguridad**: cada factura lleva una "huella" digital encadenada
  con la anterior. Si alguien intentara alterar una factura antigua, la cadena
  se rompería y se detectaría.
- **Las facturas no se pueden borrar ni cambiar** una vez emitidas.
- **Código QR de verificación** de la AEAT impreso en el PDF.
- Para corregir una factura ya emitida se hace una **factura rectificativa**
  (la original queda anulada pero conservada), como manda la norma.

### 12. Panel de inicio (dashboard)
- Cifras clave nada más entrar: alumnos activos, grupos activos, clases de la
  semana, facturado y cobrado del mes, y facturas pendientes.
- **Cuadro de mando accionable**: qué **cobros están pendientes** (para
  reclamar), las **solicitudes de inscripción** por aprobar y la **ocupación
  de cada grupo** (lleno / con plazas).

### 13. Multi-academia y alta autoservicio
- Una sola plataforma sirve a muchas academias con sus datos **aislados**.
- Cualquier academia puede **registrarse sola** desde la web (sin que nadie
  toque la base de datos).

### 14. Seguridad
- Acceso con usuario y contraseña (contraseñas cifradas).
- Sesión segura con renovación automática.
- **Protección contra ataques de fuerza bruta y registros masivos** (límite de
  intentos por minuto).

### 15. Portal de familias
- Cada familia puede tener su **propio acceso** para ver, en modo consulta, la
  información de sus hijos: **grupos, facturas y asistencia**.
- El padre/madre puede **pagar las facturas con tarjeta** desde el portal.
- La academia **da y quita** el acceso desde la ficha del alumno; un mismo
  acceso puede cubrir a **varios hermanos**.

### 16. Inscripción online (self-service)
- La academia comparte un **enlace público** (desde Ajustes) para que una
  familia se **inscriba sola** desde la web, sin que nadie teclee sus datos.
- Muestra los grupos con plaza; la solicitud llega como **inscripción
  pendiente** de aprobar (aparece en el panel de inicio).

### 17. Importar y exportar datos
- **Importar alumnos desde un CSV/Excel** (con mapeo de columnas y vista
  previa): traer los datos de otro sistema en minutos.
- **Exportar** alumnos y facturas a CSV, y el calendario a `.ics`
  (Google/Apple Calendar).

---

## Qué **todavía no** cubre (hoja de ruta)

Somos honestos sobre lo que falta:

- **Mensajería por email** a alumnos o grupos, incluidos **recordatorios
  automáticos** de facturas vencidas (requiere contratar un proveedor de envío
  de correo).
- **Generación automática** de las mensualidades cada mes (hoy se lanza con un
  clic; la app ya detecta las vencidas sola).
- **Envío automático a la Agencia Tributaria** de los registros Veri\*Factu (la
  app ya genera la huella y el QR; el envío en tiempo real requiere el
  certificado digital de una academia real ya en producción).
- **Suscripción de calendario en vivo** (hoy el calendario se exporta como
  archivo; una suscripción que se actualice sola es un paso posterior).

Ninguno de estos puntos impide vender ni usar el producto hoy: son mejoras.

---

## Cómo verlo funcionando (demo)

Hay datos de demostración listos (una "Academia Demo" con profesores, grupos,
alumnos —algunos con descuento de hermanos—, clases, asistencia y facturas con
pagos). Para arrancarlo en un ordenador, ver
[getting-started.md](getting-started.md).

Acceso a la demo:

- Web: **http://localhost:3000**
- Usuario: **admin@acme.local**
- Contraseña: **ChangeMe123!**

---

## Nota sobre el nombre

El nombre actual del proyecto (`AcadeSoft`) **se cambiará en el futuro** porque
se parece al del competidor (Acadesoft). Es una tarea pendiente, no urgente.
