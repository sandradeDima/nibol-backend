# Transferencia de datos de MySQL a SQL Server

`scripts/transfer-mysql-to-sqlserver.ts` permite importar una sola vez bases de datos que ya contienen registros. Es independiente de las migraciones de Prisma y de la ejecución de semillas. Solo realiza lecturas y una transacción de solo lectura en InnoDB sobre MySQL; nunca actualiza ni elimina filas de origen.

## Antes de la transferencia

1. Cree y verifique copias de seguridad del origen MySQL y del destino SQL Server.
2. Pause las escrituras de la aplicación y los cambios de esquema en MySQL hasta completar la transición. El importador lee una instantánea con aislamiento de lectura repetible; no copia los cambios confirmados después de esa instantánea.
3. Confirme que todas las tablas de negocio de origen usan InnoDB. El script rechaza otros motores porque no pueden compartir la instantánea coherente requerida.
4. Primero ejecute todas las migraciones de SQL Server en un destino nuevo y vacío. La transferencia exige compatibilidad exacta entre las tablas y columnas de origen y destino.
5. Use una cuenta de MySQL con acceso `SELECT` de solo lectura. Codifique en URL los caracteres especiales del usuario y la contraseña. Para TLS, agregue `?ssl=true`; si el servidor usa una CA privada, asigne a `MYSQL_SOURCE_SSL_CA` la ruta del certificado PEM.
6. Copie por separado los archivos externos de evidencias o almacenamiento de objetos. Conserve las claves y rutas de archivo referenciadas por `evidence_files`; el importador no copia archivos externos.

## Commands

Configure `DATABASE_URL` para el destino migrado y `MYSQL_SOURCE_URL` para el origen. No incluya ninguna de las credenciales en informes ni las confirme en Git.

```sh
export DATABASE_URL='sqlserver://sql-host:1433;database=NIBOL;schema=dbo;user=nibol_migrator;password={replace-me};encrypt=true'
export MYSQL_SOURCE_URL='mysql://read_only_user:encoded-password@mysql-host:3306/nibol?ssl=true'
export MYSQL_SOURCE_SSL_CA='/path/to/mysql-ca.pem' # solo si se requiere una CA privada
npm run db:transfer:mysql
```

Si la transferencia se detiene después de algunos lotes, vuelva a ejecutarla con `--resume`:

```sh
npm run db:transfer:mysql -- --resume
```

Sin `--resume`, la utilidad rechaza destinos que ya contienen filas. Con `--resume`, inserta las claves primarias faltantes, pero nunca actualiza una fila existente en el destino; compara cada fila de origen con su contraparte de destino y falla si encuentra una fila en conflicto. La reanudación inicia el recorrido desde la primera clave y concilia las filas ya copiadas; no depende de un archivo de puntos de control que pueda cambiar. Ejecútela antes de las semillas, ya que las operaciones de inserción o actualización de las semillas del sistema pueden modificar registros canónicos y cambiar los conteos.

## Verificaciones

- Nombres de las tablas de origen y destino, y compatibilidad de sus columnas.
- Uso de InnoDB como motor de almacenamiento en el origen.
- Relaciones huérfanas en origen y destino para todas las claves foráneas detectadas.
- Conteo de filas de origen y destino para cada tabla de la aplicación.
- Comparación SHA-256 de cada fila copiada después de normalizar el orden de las claves JSON, el formato de fecha de SQL Server, los decimales y los valores booleanos de MySQL almacenados como `BIT` en SQL Server.
- Orden de inserción de claves foráneas, conservación explícita de claves primarias de una sola columna, `IDENTITY_INSERT` y reinicio de los contadores de identidad.

Las filas se envían en lotes de hasta 100 y con un máximo de 2.000 parámetros, por debajo del límite de 2.100 parámetros por instrucción de SQL Server. El esquema actual de Prisma usa claves primarias de una sola columna; el importador se detiene si alguna tabla no cumple esa condición. Aplaza `workflow_definitions.active_version_id` para resolver ese ciclo anulable y verifica la relación después de restablecerla.

La utilidad y sus funciones puras de conciliación superaron una prueba sintética en vivo con contenedores desechables de MySQL 8.4 y SQL Server 2022: se verificaron 49 tablas, las 93 claves foráneas pasaron en ambos lados, se compararon seis filas representativas y una segunda ejecución con `--resume` terminó sin problemas. No se ha ejecutado contra la base de producción de MySQL ni con su volumen real de datos. Valídela en copias revisadas del origen y el destino antes de la transición. Como el importador no captura cambios, las escrituras deben permanecer pausadas durante la conciliación final y la transición.
