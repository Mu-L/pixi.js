import Attribute from './Attribute';
import Buffer from './Buffer';
import interleaveTypedArrays from '../utils/interleaveTypedArrays';
import getBufferType from '../utils/getBufferType';

const byteSizeMap = { 5126: 4, 5123: 2, 5121: 1 };
let UID = 0;

/* eslint-disable object-shorthand */
const map = {
    Float32Array: Float32Array,
    Uint32Array: Uint32Array,
    Int32Array: Int32Array,
    Uint16Array: Uint16Array,
};

/* eslint-disable max-len */

/**
 * The Geometry represents a model. It consists of two components:
 * GeometryStyle - The structure of the model such as the attributes layout
 * GeometryData - the data of the model - this consits of buffers.
 *
 * This can include anything from positions, uvs, normals, colors etc..
 *
 * Geometry can be defined without passing in a style or data if required (thats how I prefer!)
 *
 * ```js
 * let geometry = new PIXI.mesh.Geometry();
 *
 * geometry.addAttribute('positions', [0, 0, 100, 0, 100, 100, 0, 100], 2);
 * geometry.addAttribute('uvs', [0,0,1,0,1,1,0,1],2)
 * geometry.addIndex([0,1,2,1,3,2])
 *
 * ```
 * @class
 * @memberof PIXI.mesh.Geometry
 */
export default class Geometry
{
    /**
     * @param {array} buffers  an array of buffers. optional.
     * @param {object} attributes of the geometry, optional structure of the attributes layout
     */
    constructor(buffers, attributes)
    {
        this.buffers = buffers || [];

        this.indexBuffer = null;

        this.attributes = attributes || {};

        /**
         * A map of renderer IDs to webgl VAOs
         *
         * @private
         * @type {Array<VertexArrayObject>}
         */
        this.glVertexArrayObjects = [];

        this.id = UID++;
    }

    /**
    *
    * Adds an attribute to the geometry
    *
    * @param {String} id - the name of the attribute (matching up to a shader)
    * @param {PIXI.mesh.Buffer} [buffer] the buffer that holds the data of the attribute . You can also provide an Array and a buffer will be created from it.
    * @param {Number} [size=0] the size of the attribute. If you hava 2 floats per vertex (eg position x and y) this would be 2
    * @param {Boolean} [normalised=false] should the data be normalised.
    * @param {Number} [type=PIXI.TYPES.FLOAT] what type of numbe is the attribute. Check {PIXI.TYPES} to see the ones available
    * @param {Number} [stride=0] How far apart (in floats) the start of each value is. (used for interleaving data)
    * @param {Number} [start=0] How far into the array to start reading values (used for interleaving data)
    *
    * @return {PIXI.mesh.Geometry} returns self, useful for chaining.
    */
    addAttribute(id, buffer, size, normalised = false, type, stride, start, instance = false)
    {
        if (!buffer)
        {
            throw new Error('You must pass a buffer when creating an attribute');
        }

        // check if this is a buffer!
        if (!buffer.data)
        {
            // its an array!
            if (buffer instanceof Array)
            {
                buffer = new Float32Array(buffer);
            }

            buffer = new Buffer(buffer);
        }

        const ids = id.split('|');

        if (ids.length > 1)
        {
            for (let i = 0; i < ids.length; i++)
            {
                this.addAttribute(ids[i], buffer, size, normalised, type);
            }

            return this;
        }

        let bufferIndex = this.buffers.indexOf(buffer);

        if (bufferIndex === -1)
        {
            this.buffers.push(buffer);
            bufferIndex = this.buffers.length - 1;
        }

        this.attributes[id] = new Attribute(bufferIndex, size, normalised, type, stride, start, instance);

        return this;
    }

    /**
     * returns the requested attribute
     *
     * @param {String} id  the name of the attribute required
     * @return {PIXI.mesh.Attribute} the attribute requested.
     */
    getAttribute(id)
    {
        return this.buffers[this.attributes[id].buffer];
    }

    /**
    *
    * Adds an index buffer to the geometry
    * The index buffer contains integers, three for each triangle in the geometry, which reference the various attribute buffers (position, colour, UV coordinates, other UV coordinates, normal, …). There is only ONE index buffer.
    *
    * @param {PIXI.mesh.Buffer} [buffer] the buffer that holds the data of the index buffer. You can also provide an Array and a buffer will be created from it.
    * @return {PIXI.mesh.Geometry} returns self, useful for chaining.
    */
    addIndex(buffer)
    {
        if (!buffer.data)
        {
            // its an array!
            if (buffer instanceof Array)
            {
                buffer = new Uint16Array(buffer);
            }

            buffer = new Buffer(buffer);
        }

        buffer.index = true;
        this.indexBuffer = buffer;

        if (this.buffers.indexOf(buffer) === -1)
        {
            this.buffers.push(buffer);
        }

        return this;
    }

    /**
     * returns the index buffer
     *
     * @return {PIXI.mesh.Buffer} the index buffer.
     */
    getIndex()
    {
        return this.indexBuffer;
    }

    /**
     * this function modifies the structure so that all current attributes become interleaved into a single buffer
     * This can be useful if your model remains static as it offers a little performance boost
     *
     * @return {PIXI.mesh.Geometry} returns self, useful for chaining.
     */
    interleave()
    {
        // a simple check to see if buffers are already interleaved..
        if (this.buffers.length === 1 || (this.buffers.length === 2 && this.indexBuffer)) return this;

        // assume already that no buffers are interleaved
        const arrays = [];
        const sizes = [];
        const interleavedBuffer = new Buffer();
        let i;

        for (i in this.attributes)
        {
            const attribute = this.attributes[i];

            const buffer = this.buffers[attribute.buffer];

            arrays.push(buffer.data);

            sizes.push((attribute.size * byteSizeMap[attribute.type]) / 4);

            attribute.buffer = 0;
        }

        interleavedBuffer.data = interleaveTypedArrays(arrays, sizes);

        for (i = 0; i < this.buffers.length; i++)
        {
            if (this.buffers[i] !== this.indexBuffer)
            {
                this.buffers[i].destroy();
            }
        }

        this.buffers = [interleavedBuffer];

        if (this.indexBuffer)
        {
            this.buffers.push(this.indexBuffer);
        }

        return this;
    }

    /**
     * Destroys the geometry.
     */
    destroy()
    {
        for (let i = 0; i < this.glVertexArrayObjects.length; i++)
        {
            this.glVertexArrayObjects[i].destroy();
        }

        this.glVertexArrayObjects = null;

        for (let i = 0; i < this.buffers.length; i++)
        {
            this.buffers[i].destroy();
        }

        this.buffers = null;
        this.indexBuffer.destroy();

        this.attributes = null;
    }

    /**
     * returns a clone of the geometry
     *
     * @returns {PIXI.mesh.Geometry} a new clone of this geometry
     */
    clone()
    {
        const geometry = new Geometry();

        for (let i = 0; i < this.buffers.length; i++)
        {
            geometry.buffers[i] = new Buffer(this.buffers[i].data.slice());
        }

        for (const i in this.attributes)
        {
            const attrib = this.attributes[i];

            geometry.attributes[i] = new Attribute(
                attrib.buffer,
                attrib.size,
                attrib.normalized,
                attrib.type,
                attrib.stride,
                attrib.start,
                attrib.instance
            );
        }

        if (this.indexBuffer)
        {
            geometry.indexBuffer = geometry.buffers[this.buffers.indexOf(this.indexBuffer)];
            geometry.indexBuffer.index = true;
        }

        return geometry;
    }

    /**
     * merges an array of geometries into a new single one
     * geometry attribute styles must match for this operation to work
     *
     * @param {array|PIXI.mesh.Geometry} geometries array of geometries to merge
     * @returns {PIXI.mesh.Geometry} shiney new geometry
     */
    static merge(geometries)
    {
        // todo add a geometry check!
        // also a size check.. cant be too big!]

        const geometryOut = new Geometry();

        const arrays = [];
        const sizes = [];
        const offsets = [];

        let geometry;

        // pass one.. get sizes..
        for (let i = 0; i < geometries.length; i++)
        {
            geometry = geometries[i];

            for (let j = 0; j < geometry.buffers.length; j++)
            {
                sizes[j] = sizes[j] || 0;
                sizes[j] += geometry.buffers[j].data.length;
                offsets[j] = 0;
            }
        }

        // build the correct size arrays..
        for (let i = 0; i < geometry.buffers.length; i++)
        {
            // TODO types!
            arrays[i] = new map[getBufferType(geometry.buffers[i].data)](sizes[i]);
            geometryOut.buffers[i] = new Buffer(arrays[i]);
        }

        // pass to set data..
        for (let i = 0; i < geometries.length; i++)
        {
            geometry = geometries[i];

            for (let j = 0; j < geometry.buffers.length; j++)
            {
                arrays[j].set(geometry.buffers[j].data, offsets[j]);
                offsets[j] += geometry.buffers[j].data.length;
            }
        }

        geometryOut.attributes = geometry.attributes;

        if (geometry.indexBuffer)
        {
            geometryOut.indexBuffer = geometryOut.buffers[geometry.buffers.indexOf(geometry.indexBuffer)];
            geometryOut.indexBuffer.index = true;

            let offset = 0;
            let stride = 0;
            let offset2 = 0;
            let bufferIndexToCount = 0;

            // get a buffer
            for (let i = 0; i < geometry.buffers.length; i++)
            {
                if (geometry.buffers[i] !== geometry.indexBuffer)
                {
                    bufferIndexToCount = i;
                    break;
                }
            }

            // figure out the stride of one buffer..
            for (const i in geometry.attributes)
            {
                const attribute = geometry.attributes[i];

                if ((attribute.buffer | 0) === bufferIndexToCount)
                {
                    stride += ((attribute.size * byteSizeMap[attribute.type]) / 4);
                }
            }

            // time to off set all indexes..
            for (let i = 0; i < geometries.length; i++)
            {
                const indexBufferData = geometries[i].indexBuffer.data;

                for (let j = 0; j < indexBufferData.length; j++)
                {
                    geometryOut.indexBuffer.data[j + offset2] += offset;
                }

                offset += geometry.buffers[bufferIndexToCount].data.length / (stride);
                offset2 += indexBufferData.length;
            }
        }

        return geometryOut;
    }
}